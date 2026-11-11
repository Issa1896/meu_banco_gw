const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const Ticket = require('../models/Ticket');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const transferService = require('../services/transferService');
const { MoneyError } = require('../utils/money');
const { asString, pagination, escapeRegex } = require('../utils/query');

const ROLE_RANK = { user: 0, admin: 1, superadmin: 2 };
const USER_STATUSES = ['pending', 'active', 'suspended', 'blocked'];

exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, activeUsers, pendingKYC, totalTransactions,
      monthlyTransactions, totalVolume, pendingTickets, recentLogs] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ kycStatus: 'pending' }),
      Transaction.countDocuments(),
      Transaction.countDocuments({ createdAt: { $gte: firstDay } }),
      Transaction.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Ticket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      AuditLog.find().sort({ createdAt: -1 }).limit(10).populate('user', 'name email'),
    ]);

    res.json({
      stats: {
        totalUsers,
        activeUsers,
        pendingKYC,
        totalTransactions,
        monthlyTransactions,
        totalVolume: totalVolume[0]?.total || 0,
        pendingTickets,
      },
      recentLogs,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
    const status = asString(req.query.status);
    const role = asString(req.query.role);
    const search = asString(req.query.search, 100);
    const query = {};
    if (status) query.status = status;
    if (role) query.role = role;
    if (search) {
      const pattern = escapeRegex(search);
      query.$or = [
        { name: { $regex: pattern, $options: 'i' } },
        { email: { $regex: pattern, $options: 'i' } },
        { phone: { $regex: pattern, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const transactions = await Transaction.find({
      $or: [{ sender: user._id }, { recipient: user._id }],
    }).sort({ createdAt: -1 }).limit(20);

    res.json({ user, transactions });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!USER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${USER_STATUSES.join(', ')}` });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (target._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ error: 'Não é possível alterar o próprio status' });
    }
    // Um admin só altera contas de nível inferior ao seu
    if (ROLE_RANK[target.role] >= ROLE_RANK[req.user.role]) {
      return res.status(403).json({ error: 'Sem permissão para alterar esta conta' });
    }

    target.status = status;
    if (status !== 'active') target.refreshTokenHash = undefined; // encerra sessões
    await target.save();
    const user = target;

    await AuditLog.create({
      user: req.user._id,
      action: `USER_STATUS_${status.toUpperCase()}`,
      resource: 'User',
      resourceId: user._id,
      details: { reason, targetUser: user._id },
      severity: status === 'blocked' ? 'critical' : 'warning',
      ipAddress: req.ip,
    });

    await Notification.create({
      user: user._id,
      type: 'system_update',
      title: `Conta ${status === 'active' ? 'ativada' : status === 'blocked' ? 'bloqueada' : 'suspensa'}`,
      message: reason || `Sua conta foi ${status === 'active' ? 'ativada' : status}`,
    });

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
};

exports.approveKYC = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    user.kycStatus = 'verified';
    if (user.kycDocuments.length > 0) {
      user.kycDocuments[user.kycDocuments.length - 1].status = 'approved';
      user.kycDocuments[user.kycDocuments.length - 1].reviewedAt = new Date();
      user.kycDocuments[user.kycDocuments.length - 1].reviewedBy = req.user._id;
    }
    await user.save();

    res.json({ message: 'KYC aprovado', user });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao aprovar KYC' });
  }
};

exports.rejectKYC = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    user.kycStatus = 'rejected';
    if (user.kycDocuments.length > 0) {
      user.kycDocuments[user.kycDocuments.length - 1].status = 'rejected';
    }
    await user.save();

    res.json({ message: 'KYC rejeitado', user });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao rejeitar KYC' });
  }
};

exports.listTickets = async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
    const status = asString(req.query.status);
    const priority = asString(req.query.priority);
    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const tickets = await Ticket.find(query)
      .populate('user', 'name email phone')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      tickets,
      pagination: { page, limit, total: await Ticket.countDocuments(query) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar tickets' });
  }
};

exports.replyTicketAdmin = async (req, res) => {
  try {
    const { message } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    ticket.messages.push({ sender: req.user._id, message, isAI: false });
    ticket.status = 'waiting_customer';
    ticket.assignedTo = req.user._id;
    await ticket.save();

    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao responder ticket' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
    const status = asString(req.query.status);
    const type = asString(req.query.type);
    const startDate = asString(req.query.startDate);
    const endDate = asString(req.query.endDate);
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate && !Number.isNaN(Date.parse(startDate))) query.createdAt.$gte = new Date(startDate);
      if (endDate && !Number.isNaN(Date.parse(endDate))) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate('sender', 'name email')
      .populate('recipient', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(query);
    const volume = await Transaction.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      transactions,
      volume: volume[0]?.total || 0,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar transações' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
    const action = asString(req.query.action);
    const severity = asString(req.query.severity);
    const query = {};
    if (action) query.action = action;
    if (severity) query.severity = severity;

    const logs = await AuditLog.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      logs,
      pagination: { page, limit, total: await AuditLog.countDocuments(query) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar logs' });
  }
};

exports.getSystemAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }

    const monthlyStats = await Promise.all(months.map(async ({ month, year }) => {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      const [transactions, volume, newUsers] = await Promise.all([
        Transaction.countDocuments({ createdAt: { $gte: start, $lte: end }, status: 'completed' }),
        Transaction.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end }, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      ]);
      return { month, year, transactions, volume: volume[0]?.total || 0, newUsers };
    }));

    const topMethods = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, volume: { $sum: '$amount' } } },
      { $sort: { volume: -1 } },
    ]);

    res.json({ monthlyStats, topMethods });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar analytics' });
  }
};

exports.reverseTransaction = async (req, res) => {
  try {
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 10 || reason.length > 500) {
      return res.status(400).json({ error: 'Informe o motivo do estorno (10 a 500 caracteres)' });
    }

    const { original, refund } = await transferService.reverseTransfer({
      transactionId: req.params.id,
      adminId: req.user._id,
      reason,
    });

    AuditLog.create({
      user: req.user._id,
      action: 'TRANSFER_REVERSED',
      resource: 'Transaction',
      resourceId: original._id,
      details: { reason, refundId: refund._id, amountXOF: original.amount },
      severity: 'critical',
      ipAddress: req.ip,
    }).catch((err) => logger.error('Falha no AuditLog:', err));

    res.json({ message: 'Transação estornada com sucesso', transaction: original, refund });
  } catch (error) {
    if (error instanceof MoneyError) return res.status(error.statusCode).json({ error: error.message });
    if (error.name === 'CastError') return res.status(400).json({ error: 'ID inválido' });
    logger.error('Erro ao estornar transação:', error);
    res.status(500).json({ error: 'Erro ao estornar transação' });
  }
};
