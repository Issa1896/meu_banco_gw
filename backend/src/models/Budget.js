const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: {
    type: String,
    enum: [
      'alimentacao', 'transporte', 'moradia', 'saude',
      'educacao', 'lazer', 'servicos', 'compras',
      'transferencia', 'salario', 'investimento', 'outros'
    ],
    required: true,
  },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  limit: { type: Number, required: true },
  spent: { type: Number, default: 0 },
  alerts: {
    enabled: { type: Boolean, default: true },
    threshold: { type: Number, default: 80 }, // %
    notified: { type: Boolean, default: false },
  },
  rollover: { type: Boolean, default: false },
}, { timestamps: true });

budgetSchema.index({ user: 1, month: 1, year: 1 });
budgetSchema.index({ user: 1, category: 1 });

module.exports = mongoose.model('Budget', budgetSchema);
