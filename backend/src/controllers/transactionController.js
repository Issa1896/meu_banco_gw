const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { generateTransactionRef, calculateFee } = require('../utils/helpers');
const { validationResult } = require('express-validator');
const { getIO } = require('../config/socket');
const logger = require('../utils/logger');

exports.createTransfer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
    }

    const { recipientAccount, amount, currency, description, paymentMethod } = req.body;

    const recipient = await User.findOne({ accountNumber: recipientAccount });
    if (!recipient) {
      return res.status(404).json({ error: 'Conta do destinatário não encontrada' });
    }

    if (recipient._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Não pode transferir para si mesmo' });
    }

    const fee = calculateFee(amount, paymentMethod);
    const totalAmount = amount + fee;

    if (req.user.balance < totalAmount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const transaction = await Transaction.create({
      transactionRef: generateTransactionRef(),
      sender: req.user._id,
      recipient: recipient._id,
      recipientName: recipient.name,
      recipientAccount,
      type: 'transfer',
      amount,
      fee,
      totalAmount,
      currency,
      paymentMethod,
      description: description || 'Transferência',

      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceId: req.headers['x-device-id'],
    });

    // Process payment via selected method
    if (paymentMethod === 'orange_money') {
      await processOrangeMoneyPayment(transaction);
    } else if (paymentMethod === 'mobile_money') {
      await processMobileMoneyPayment(transaction);
    } else if (paymentMethod === 'pix') {
      await processPixPayment(transaction);
    } else if (paymentMethod === 'iban') {
      await processIBANPayment(transaction);
    } else {
      // Internal wallet transfer
      await processWalletTransfer(transaction);
    }

    await AuditLog.create({
      user: req.user._id,
      action: 'TRANSFER_CREATED',
      resource: 'Transaction',
      resourceId: transaction._id,
      details: { amount, recipient: recipientAccount, method: paymentMethod },
      ipAddress: req.ip,
    });

    // Real-time notification
    const io = getIO();
    io.to(`user:${req.user._id}`).emit('transaction:new', transaction);
    io.to(`user:${recipient._id}`).emit('transaction:received', transaction);

    res.status(201).json({
      message: 'Transferência realizada com sucesso',
      transaction,
    });
  } catch (error) {
    logger.error('Erro na transferência:', error);
    res.status(500).json({ error: 'Erro ao processar transferência' });
  }
};

async function processWalletTransfer(transaction) {
  const session = await Transaction.startSession();
  session.startTransaction();

  try {
    const sender = await User.findById(transaction.sender).session(session);
    const recipient = await User.findById(transaction.recipient).session(session);

    sender.balance -= transaction.totalAmount;
    recipient.balance += transaction.amount;

    await sender.save({ session });
    await recipient.save({ session });

    transaction.status = 'completed';
    transaction.completedAt = new Date();
    await transaction.save({ session });

    await Notification.create([{
      user: transaction.sender,
      type: 'transaction_sent',
      title: 'Transferência enviada',
      message: `Você enviou ${transaction.amount} ${transaction.currency} para ${transaction.recipientName}`,
      data: { transactionId: transaction._id, transactionRef: transaction.transactionRef },
    }, {
      user: transaction.recipient,
      type: 'transaction_received',
      title: 'Transferência recebida',
      message: `Você recebeu ${transaction.amount} ${transaction.currency} de ${sender.name}`,
      data: { transactionId: transaction._id, transactionRef: transaction.transactionRef },
    }], { session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    transaction.status = 'failed';
    transaction.failureReason = error.message;
    await transaction.save();
    throw error;
  } finally {
    session.endSession();
  }
}

async function processOrangeMoneyPayment(transaction) {
  // Integração com API Orange Money
  // Em produção: chamar API real
  transaction.status = 'processing';
  transaction.paymentDetails = {
    orangeMoneyId: `OM-${Date.now()}`,
  };
  await transaction.save();

  // Simular processamento
  setTimeout(async () => {
    try {
      await processWalletTransfer(transaction);
    } catch (error) {
      logger.error('Orange Money falhou:', error);
    }
  }, 5000);
}

async function processMobileMoneyPayment(transaction) {
  transaction.status = 'processing';
  transaction.paymentDetails = {
    mobileMoneyId: `MM-${Date.now()}`,
  };
  await transaction.save();

  setTimeout(async () => {
    try {
      await processWalletTransfer(transaction);
    } catch (error) {
      logger.error('Mobile Money falhou:', error);
    }
  }, 5000);
}

async function processPixPayment(transaction) {
  // Integração PIX
  transaction.paymentDetails = {
    pixKey: transaction.description,
    bankReference: `PIX-${Date.now()}`,
  };
  transaction.status = 'processing';
  await transaction.save();
}

async function processIBANPayment(transaction) {
  // Integração IBAN/SWIFT
  transaction.paymentDetails = {
    iban: transaction.description,
    swift: `SWIFT-${Date.now()}`,
  };
  transaction.status = 'processing';
  await transaction.save();
}

exports.getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status, startDate, endDate, category } = req.query;
    const query = {
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
    };

    if (type) query.type = type;
    if (status) query.status = status;
    if (category) query.category = category;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate('sender', 'name email')
      .populate('recipient', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
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
    }).populate('sender', 'name email')
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
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);

    const transactions = await Transaction.find({
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed',
    }).sort({ createdAt: -1 });

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

exports.reverseTransaction = async (req, res) => {
  try {
    const { reason } = req.body;
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      sender: req.user._id,
      status: 'completed',
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada ou não pode ser revertida' });
    }

    // Reverter valores
    const sender = await User.findById(transaction.sender);
    const recipient = await User.findById(transaction.recipient);

    sender.balance += transaction.totalAmount;
    recipient.balance -= transaction.amount;

    if (recipient.balance < 0) {
      return res.status(400).json({ error: 'Saldo do destinatário insuficiente para reversão' });
    }

    await sender.save();
    await recipient.save();

    transaction.status = 'reversed';
    transaction.reversedAt = new Date();
    transaction.reversedBy = req.user._id;
    transaction.reversalReason = reason;
    await transaction.save();

    res.json({ message: 'Transação revertida com sucesso', transaction });
  } catch (error) {
    logger.error('Erro ao reverter transação:', error);
    res.status(500).json({ error: 'Erro ao reverter transação' });
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
