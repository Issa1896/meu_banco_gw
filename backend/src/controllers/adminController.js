const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const Ticket = require('../models/Ticket');
const Notification = require('../models/Notification');

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
    const { page = 1, limit = 50, status, role, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
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
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });

    await AuditLog.create({
      user: req.user._id,
      action: `USER_STATUS_${status.toUpperCase()}`,
      resource: 'User',
      resourceId: user._id,
      details: { reason },
      severity: status === 'blocked' ? 'critical' : 'warning',
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
    const { status, priority, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const tickets = await Ticket.find(query)
      .populate('user', 'name email phone')
      .sort({ priority: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      tickets,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: await Ticket.countDocuments(query) },
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
    const { page = 1, limit = 50, status, type, startDate, endDate } = req.query;
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
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
    const volume = await Transaction.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      transactions,
      volume: volume[0]?.total || 0,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar transações' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, severity } = req.query;
    const query = {};
    if (action) query.action = action;
    if (severity) query.severity = severity;

    const logs = await AuditLog.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      logs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: await AuditLog.countDocuments(query) },
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
