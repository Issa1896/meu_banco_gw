const crypto = require('crypto');
const JournalEntry = require('../models/JournalEntry');
const User = require('../models/User');
const { MoneyError } = require('../utils/money');

const userAccount = (userId) => `user:${userId.toString()}`;
const ACCOUNTS = {
  fees: 'system:fees',
  opening: 'system:opening',
  adjustments: 'system:adjustments',
};

const journalRef = () => `JRN-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/** Grava um lançamento. Deve ser chamado DENTRO da mesma sessão que altera saldos. */
const post = async ({ type, lines, transaction, description, createdBy }, session) => {
  const [entry] = await JournalEntry.create([{
    journalRef: journalRef(),
    type,
    lines: lines.filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0),
    transaction,
    description,
    createdBy,
  }], { session });
  return entry;
};

/** Transferência: debita remetente (valor + taxa), credita destinatário e receita de taxas. */
const postTransfer = (tx, session) => post({
  type: 'transfer',
  transaction: tx._id,
  description: `Transferência ${tx.transactionRef}`,
  lines: [
    { account: userAccount(tx.sender), debit: tx.totalAmount },
    { account: userAccount(tx.recipient), credit: tx.amount },
    { account: ACCOUNTS.fees, credit: tx.fee },
  ],
}, session);

/** Estorno: devolve o valor do destinatário ao remetente. */
const postRefund = (refundTx, adminId, session) => post({
  type: 'refund',
  transaction: refundTx._id,
  createdBy: adminId,
  description: refundTx.description,
  lines: [
    { account: userAccount(refundTx.sender), debit: refundTx.amount },
    { account: userAccount(refundTx.recipient), credit: refundTx.amount },
  ],
}, session);

/**
 * Ajuste manual (superadmin) ou saldo de abertura. amount > 0 credita o
 * cliente; amount < 0 debita, e só se houver saldo. Atualiza o saldo
 * espelho (User.balance) na mesma sessão.
 */
const postBalanceChange = async ({ userId, amount, type, description, createdBy }, session) => {
  if (!Number.isInteger(amount) || amount === 0) throw new MoneyError('Valor do ajuste deve ser inteiro e diferente de zero');
  const contra = type === 'opening_balance' ? ACCOUNTS.opening : ACCOUNTS.adjustments;

  const filter = amount < 0 ? { _id: userId, balance: { $gte: -amount } } : { _id: userId };
  const user = await User.findOneAndUpdate(filter, { $inc: { balance: amount } }, { session, new: true });
  if (!user) throw new MoneyError(amount < 0 ? 'Saldo insuficiente para o ajuste' : 'Usuário não encontrado', amount < 0 ? 400 : 404);

  const value = Math.abs(amount);
  const entry = await post({
    type,
    description,
    createdBy,
    lines: amount > 0
      ? [{ account: contra, debit: value }, { account: userAccount(userId), credit: value }]
      : [{ account: userAccount(userId), debit: value }, { account: contra, credit: value }],
  }, session);
  return { entry, user };
};

/** Saldos por conta a partir do razão. */
const accountBalances = async () => {
  const rows = await JournalEntry.aggregate([
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.account',
        debit: { $sum: '$lines.debit' },
        credit: { $sum: '$lines.credit' },
        entries: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({
    account: r._id,
    debit: r.debit,
    credit: r.credit,
    // passivo/receita: saldo natural credor
    balance: r.credit - r.debit,
    entries: r.entries,
  }));
};

/** Balancete: total de débitos deve ser igual ao de créditos. */
const trialBalance = async () => {
  const accounts = await accountBalances();
  const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
  const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);
  return { accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
};

/**
 * Conciliação: compara o saldo de cada cliente no razão com User.balance.
 * Divergência = bug ou alteração de saldo fora do serviço de lançamento.
 */
const reconcile = async () => {
  const [accounts, users] = await Promise.all([
    accountBalances(),
    User.find({}).select('_id name accountNumber balance').lean(),
  ]);
  const ledgerByUser = new Map(accounts
    .filter((a) => a.account.startsWith('user:'))
    .map((a) => [a.account.slice(5), a.balance]));

  const mismatches = [];
  users.forEach((u) => {
    const ledger = ledgerByUser.get(u._id.toString()) || 0;
    if (ledger !== u.balance) {
      mismatches.push({
        userId: u._id, accountNumber: u.accountNumber, name: u.name,
        cachedBalance: u.balance, ledgerBalance: ledger, difference: u.balance - ledger,
      });
    }
    ledgerByUser.delete(u._id.toString());
  });
  // Conta no razão sem usuário correspondente
  ledgerByUser.forEach((balance, userId) => {
    if (balance !== 0) mismatches.push({ userId, cachedBalance: null, ledgerBalance: balance, difference: -balance });
  });

  const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
  const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);

  return {
    checkedAt: new Date(),
    usersChecked: users.length,
    balanced: totalDebit === totalCredit,
    ok: mismatches.length === 0 && totalDebit === totalCredit,
    mismatches,
  };
};

/**
 * Migração de saldos anteriores ao razão: lança a DIFERENÇA entre
 * User.balance e o saldo no razão como "opening_balance", sem alterar
 * User.balance. Idempotente. Com apply=false só relata.
 */
const backfillOpeningBalances = async ({ apply = false } = {}) => {
  const balances = new Map((await accountBalances())
    .filter((a) => a.account.startsWith('user:'))
    .map((a) => [a.account.slice(5), a.balance]));
  const users = await User.find({}).select('_id accountNumber balance').lean();

  const changes = [];
  for (const u of users) {
    const ledgerBalance = balances.get(u._id.toString()) || 0;
    const diff = u.balance - ledgerBalance;
    if (diff !== 0) {
      changes.push({ accountNumber: u.accountNumber, cachedBalance: u.balance, ledgerBalance, diff });
      if (apply) {
        const account = userAccount(u._id);
        const value = Math.abs(diff);
        // eslint-disable-next-line no-await-in-loop
        await post({
          type: 'opening_balance',
          description: 'Migração para o livro-razão',
          lines: diff > 0
            ? [{ account: ACCOUNTS.opening, debit: value }, { account, credit: value }]
            : [{ account, debit: value }, { account: ACCOUNTS.opening, credit: value }],
        });
      }
    }
  }
  return { applied: apply, changes };
};

/** Extrato de uma conta (mais recentes primeiro). */
const statement = async (account, { limit = 50, skip = 0 } = {}) => {
  const entries = await JournalEntry.find({ 'lines.account': account })
    .sort({ postedAt: -1 }).skip(skip).limit(limit).lean();
  return entries.map((e) => {
    const line = e.lines.find((l) => l.account === account) || {};
    return {
      journalRef: e.journalRef, type: e.type, postedAt: e.postedAt, description: e.description,
      transaction: e.transaction, debit: line.debit || 0, credit: line.credit || 0,
    };
  });
};

module.exports = {
  ACCOUNTS,
  userAccount,
  post,
  postTransfer,
  postRefund,
  postBalanceChange,
  accountBalances,
  trialBalance,
  reconcile,
  backfillOpeningBalances,
  statement,
};
