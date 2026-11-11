const crypto = require('crypto');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { generateTransactionRef } = require('../utils/helpers');
const { MoneyError, quote } = require('../utils/money');
const { resolveSettlement } = require('./paymentProviders');
const ledger = require('./ledgerService');

const fmt = (xof) => `${Number(xof).toLocaleString('pt-PT')} XOF`;

const hashRequest = (data) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

/** Executa fn numa transação MongoDB, com retry automático de conflitos. */
const inTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await fn(session); });
    return result;
  } finally {
    await session.endSession();
  }
};

/** Procura uma transferência já feita com a mesma chave de idempotência. */
const findReplay = async (senderId, idempotencyKey, requestHash) => {
  if (!idempotencyKey) return null;
  const existing = await Transaction.findOne({ sender: senderId, idempotencyKey });
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw new MoneyError('Idempotency-Key já usada com dados diferentes', 422);
  }
  return existing;
};

/**
 * Transferência atômica.
 *
 * O saldo é verificado e debitado NUMA ÚNICA operação ($inc condicional a
 * balance >= total), dentro de uma transação MongoDB junto com o crédito,
 * o registro da transação, o lançamento no livro-razão e as notificações. Duas requisições simultâneas
 * não conseguem gastar o mesmo saldo: a segunda não encontra saldo e falha,
 * e nada fica pela metade.
 */
const createTransfer = async ({
  senderId, recipientAccount, amount, currency, paymentMethod,
  description, category, idempotencyKey, meta = {},
}) => {
  const q = quote(amount, currency, paymentMethod);
  const settlement = resolveSettlement(paymentMethod);

  const requestHash = hashRequest({
    recipientAccount, amountXOF: q.amountXOF, originalAmount: q.originalAmount,
    currency: q.originalCurrency, paymentMethod, description: description || '', category: category || '',
  });

  const replay = await findReplay(senderId, idempotencyKey, requestHash);
  if (replay) return { transaction: replay, replayed: true };

  const recipient = await User.findOne({ accountNumber: recipientAccount });
  if (!recipient || recipient.status !== 'active') {
    throw new MoneyError('Conta do destinatário não encontrada', 404);
  }
  if (recipient._id.toString() === senderId.toString()) {
    throw new MoneyError('Não pode transferir para si mesmo');
  }

  try {
    const transaction = await inTransaction(async (session) => {
      const sender = await User.findOneAndUpdate(
        { _id: senderId, status: 'active', balance: { $gte: q.totalXOF } },
        { $inc: { balance: -q.totalXOF } },
        { session, new: true },
      );
      if (!sender) throw new MoneyError('Saldo insuficiente');

      const credit = await User.updateOne(
        { _id: recipient._id, status: 'active' },
        { $inc: { balance: q.amountXOF } },
        { session },
      );
      if (credit.matchedCount !== 1) throw new MoneyError('Conta do destinatário indisponível', 409);

      const now = new Date();
      const [tx] = await Transaction.create([{
        transactionRef: generateTransactionRef(),
        sender: senderId,
        recipient: recipient._id,
        recipientName: recipient.name,
        recipientAccount,
        type: 'transfer',
        amount: q.amountXOF,
        fee: q.feeXOF,
        totalAmount: q.totalXOF,
        currency: 'XOF',
        originalAmount: q.originalAmount,
        originalCurrency: q.originalCurrency,
        exchangeRate: q.exchangeRate,
        paymentMethod,
        paymentDetails: settlement,
        description: description || 'Transferência',
        category: category || 'transferencia',
        status: 'completed',
        completedAt: now,
        idempotencyKey: idempotencyKey || undefined,
        requestHash,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        deviceId: meta.deviceId,
      }], { session });

      // Lançamento contábil na MESMA transação: ou tudo é gravado, ou nada
      await ledger.postTransfer(tx, session);

      await Notification.insertMany([{
        user: senderId,
        type: 'transaction_sent',
        title: 'Transferência enviada',
        message: `Você enviou ${fmt(q.amountXOF)} para ${recipient.name}`,
        data: { transactionId: tx._id, transactionRef: tx.transactionRef },
      }, {
        user: recipient._id,
        type: 'transaction_received',
        title: 'Transferência recebida',
        message: `Você recebeu ${fmt(q.amountXOF)} de ${sender.name}`,
        data: { transactionId: tx._id, transactionRef: tx.transactionRef },
      }], { session });

      return tx;
    });

    return { transaction, recipient, replayed: false };
  } catch (error) {
    // Duas requisições simultâneas com a mesma chave: a segunda cai no índice único
    if (error.code === 11000 && idempotencyKey) {
      const existing = await findReplay(senderId, idempotencyKey, requestHash);
      if (existing) return { transaction: existing, replayed: true };
    }
    throw error;
  }
};

/**
 * Estorno (somente admin). Cria uma transação "refund" que devolve o valor
 * ao remetente, debitando o destinatário — tudo atômico. A marcação da
 * original como "reversed" é condicional, então ninguém estorna duas vezes.
 * A taxa NÃO é devolvida (política a revisar com o ledger contábil).
 */
const reverseTransfer = async ({ transactionId, adminId, reason }) => inTransaction(async (session) => {
  const original = await Transaction.findOneAndUpdate(
    { _id: transactionId, status: 'completed', type: 'transfer' },
    { $set: { status: 'reversed', reversedAt: new Date(), reversedBy: adminId, reversalReason: reason } },
    { session, new: true },
  );
  if (!original) throw new MoneyError('Transação não encontrada ou não pode ser estornada', 409);

  const debit = await User.findOneAndUpdate(
    { _id: original.recipient, balance: { $gte: original.amount } },
    { $inc: { balance: -original.amount } },
    { session, new: true },
  );
  if (!debit) throw new MoneyError('Saldo do destinatário insuficiente para o estorno', 409);

  await User.updateOne({ _id: original.sender }, { $inc: { balance: original.amount } }, { session });

  const [refund] = await Transaction.create([{
    transactionRef: generateTransactionRef(),
    sender: original.recipient,
    recipient: original.sender,
    recipientAccount: undefined,
    type: 'refund',
    amount: original.amount,
    fee: 0,
    totalAmount: original.amount,
    currency: 'XOF',
    paymentMethod: 'wallet',
    description: `Estorno de ${original.transactionRef}`.slice(0, 200),
    category: original.category,
    status: 'completed',
    completedAt: new Date(),
    relatedTransaction: original._id,
  }], { session });

  await ledger.postRefund(refund, adminId, session);

  original.relatedTransaction = refund._id;
  await original.save({ session });

  await Notification.insertMany([{
    user: original.sender,
    type: 'account_credited',
    title: 'Estorno recebido',
    message: `A transferência ${original.transactionRef} foi estornada: ${fmt(original.amount)} devolvidos`,
    data: { transactionId: refund._id, originalTransactionId: original._id },
  }, {
    user: original.recipient,
    type: 'account_debited',
    title: 'Transferência estornada',
    message: `A transferência ${original.transactionRef} foi estornada: ${fmt(original.amount)} debitados`,
    data: { transactionId: refund._id, originalTransactionId: original._id },
  }], { session });

  return { original, refund };
});

module.exports = { createTransfer, reverseTransfer, hashRequest };
