const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: [
      'transaction_received', 'transaction_sent',
      'payment_confirmed', 'payment_failed',
      'account_credited', 'account_debited',
      'budget_alert', 'monthly_report',
      'security_alert', 'login_alert',
      'kyc_update', 'system_update',
      'promotional', 'support_message',
    ],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  channel: [{ type: String, enum: ['in_app', 'push', 'email', 'sms'] }],
  sentAt: { type: Date },
  deliveredAt: { type: Date },
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ type: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
