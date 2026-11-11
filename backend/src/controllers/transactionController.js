const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { validationResult } = require('express-validator');
const { getIO } = require('../config/socket');
const logger = require('../utils/logger');
const transferService = require('../services/transferService');
const { MoneyError, quote } = require('../utils/money');
const { asString, pagination } = require('../utils/query');

const PUBLIC_TX_FIELDS = [
  '_id', 'transactionRef', 'type', 'status', 'amount', 'fee', 'totalAmount', 'currency',
  'originalAmount', 'originalCurrency', 'exchangeRate', 'paymentMethod', 'description',
  'category', 'recipientName', 'recipientAccount', 'createdAt', 'completedAt',
];

/** Visão da transação sem metadados do remetente (IP, user agent, dispositivo). */
const publicView = (tx) => {
  const obj = typeof tx.toObject === 'function' ? tx.toObject() : tx;
  return Object.fromEntries(PUBLIC_TX_FIELDS.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
};

const sendError = (res, error, fallback) => {
  if (error instanceof MoneyError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  logger.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

exports.createTransfer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
    }

    const idempotencyKey = req.get('Idempotency-Key');
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      return res.status(400).json({ error: 'Idempotency-Key inválida' });
    }

    const { recipientAccount, amount, currency, description, paymentMethod, category } = req.body;

    const { transaction, recipient, replayed } = await transferService.createTransfer({
      senderId: req.user._id,
      recipientAccount,
      amount,
      currency,
      paymentMethod,
      description,
      category,
      idempotencyKey,
      meta: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        deviceId: req.headers['x-device-id'],
      },
    });

    if (replayed) {
      res.set('Idempotent-Replayed', 'true');
      return res.status(200).json({
        message: 'Transferência já processada anteriormente',
        transaction: publicView(transaction),
      });
    }

    AuditLog.create({
      user: req.user._id,
      action: 'TRANSFER_CREATED',
      resource: 'Transaction',
      resourceId: transaction._id,
      details: {
        amountXOF: transaction.amount, fee: transaction.fee, recipient: recipientAccount, method: paymentMethod,
      },
      ipAddress: req.ip,
    }).catch((err) => logger.error('Falha no AuditLog:', err));

    // Tempo real (não bloqueia a resposta se o socket falhar)
    try {
      const io = getIO();
      const view = publicView(transaction);
      io.to(`user:${req.user._id}`).emit('transaction:new', view);
      io.to(`user:${recipient._id}`).emit('transaction:received', {
        ...view, fee: undefined, totalAmount: undefined, senderName: req.user.name,
      });
    } catch (socketError) {
      logger.warn(`Notificação em tempo real falhou: ${socketError.message}`);
    }

    res.status(201).json({
      message: 'Transferência realizada com sucesso',
      transaction: publicView(transaction),
    });
  } catch (error) {
    return sendError(res, error, 'Erro ao processar transferência');
  }
};

exports.getQuote = async (req, res) => {
  try {
    const { amount, currency = 'XOF', paymentMethod } = req.query;
    const q = quote(String(amount), String(currency), String(paymentMethod));
    res.json({
      quote: {
        amount: q.originalAmount,
        currency: q.originalCurrency,
        exchangeRate: q.exchangeRate,
        amountXOF: q.amountXOF,
        fee: q.feeXOF,
        feeRate: q.feeRate,
        total: q.totalXOF,
        settlementCurrency: q.settlementCurrency,
      },
    });
  } catch (error) {
    return sendError(res, error, 'Erro ao calcular taxa');
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 20 });
    const type = asString(req.query.type);
    const status = asString(req.query.status);
    const category = asString(req.query.category);
    const startDate = asString(req.query.startDate);
    const endDate = asString(req.query.endDate);

    const query = {
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
    };

    if (type) query.type = type;
    if (status) query.status = status;
    if (category) query.category = category;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate && !Number.isNaN(Date.parse(startDate))) query.createdAt.$gte = new Date(startDate);
      if (endDate && !Number.isNaN(Date.parse(endDate))) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate('sender', 'name email')
      .populate('recipient', 'name email')
      .select('-ipAddress -userAgent -deviceId -requestHash -idempotencyKey')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Erro ao listar transações:', error);
    res.status(500).json({ error: 'Erro ao listar transações' });
  }
};

exports.getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
    }).select('-ipAddress -userAgent -deviceId -requestHash -idempotencyKey')
      .populate('sender', 'name email')
      .populate('recipient', 'name email');

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    res.json({ transaction });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar transação' });
  }
};

exports.getMonthlyReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = Math.min(Math.max(parseInt(asString(month), 10) || new Date().getMonth() + 1, 1), 12);
    const y = parseInt(asString(year), 10) || new Date().getFullYear();

    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);

    const transactions = await Transaction.find({
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed',
    }).select('-ipAddress -userAgent -deviceId -requestHash -idempotencyKey').sort({ createdAt: -1 });

    const report = {
      month: m,
      year: y,
      totalSent: 0,
      totalReceived: 0,
      totalFees: 0,
      transactionCount: transactions.length,
      byCategory: {},
      byMethod: {},
      daily: {},
      transactions,
    };

    transactions.forEach(t => {
      const isSender = t.sender.toString() === req.user._id.toString();
      if (isSender) {
        report.totalSent += t.amount;
        report.totalFees += t.fee || 0;
      } else {
        report.totalReceived += t.amount;
      }

      const cat = t.category || 'outros';
      if (!report.byCategory[cat]) report.byCategory[cat] = { count: 0, total: 0 };
      report.byCategory[cat].count += 1;
      report.byCategory[cat].total += t.amount;

      const method = t.paymentMethod;
      if (!report.byMethod[method]) report.byMethod[method] = { count: 0, total: 0 };
      report.byMethod[method].count += 1;
      report.byMethod[method].total += t.amount;

      const day = new Date(t.createdAt).getDate();
      if (!report.daily[day]) report.daily[day] = { income: 0, expense: 0 };
      if (isSender) {
        report.daily[day].expense += t.amount;
      } else {
        report.daily[day].income += t.amount;
      }
    });

    res.json({ report });
  } catch (error) {
    logger.error('Erro ao gerar relatório:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório mensal' });
  }
};

exports.getBalance = async (req, res) => {
  res.json({
    balance: req.user.balance,
    currency: req.user.currency,
    accountNumber: req.user.accountNumber,
  });
};

exports.getStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const stats = await Transaction.aggregate([
      {
        $match: {
          $or: [{ sender: req.user._id }, { recipient: req.user._id }],
          createdAt: { $gte: thirtyDaysAgo },
          status: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalSent: {
            $sum: { $cond: [{ $eq: ['$sender', req.user._id] }, '$amount', 0] },
          },
          totalReceived: {
            $sum: { $cond: [{ $eq: ['$recipient', req.user._id] }, '$amount', 0] },
          },
          totalFees: { $sum: '$fee' },
        },
      },
    ]);

    res.json({
      stats: stats[0] || { totalTransactions: 0, totalSent: 0, totalReceived: 0, totalFees: 0 },
      balance: req.user.balance,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
};
