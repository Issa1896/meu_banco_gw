const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 50, read, type } = req.query;
    const query = { user: req.user._id };
    if (read !== undefined) query.read = read === 'true';
    if (type) query.type = type;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });

    res.json({
      notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: await Notification.countDocuments(query),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar notificações' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true, readAt: new Date() },
      { new: true },
    );
    if (!notification) {
      return res.status(404).json({ error: 'Notificação não encontrada' });
    }
    res.json({ notification });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao marcar notificação' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { read: true, readAt: new Date() },
    );
    res.json({ message: 'Todas notificações marcadas como lidas' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao marcar notificações' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ message: 'Notificação removida' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover notificação' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const { email, sms, push } = req.body;
    req.user.preferences.notifications = { email, sms, push };
    await req.user.save();
    res.json({ preferences: req.user.preferences.notifications });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar preferências' });
  }
};
