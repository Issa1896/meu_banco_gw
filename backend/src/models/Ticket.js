const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  category: {
    type: String,
    enum: ['technical', 'payment', 'security', 'account', 'general'],
    required: true,
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'],
    default: 'open',
  },
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    attachments: [{ fileName: String, fileUrl: String }],
    isAI: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
  closedAt: Date,
  satisfaction: { type: Number, min: 1, max: 5 },
}, { timestamps: true });

ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ status: 1, priority: -1 });

module.exports = mongoose.model('Ticket', ticketSchema);
