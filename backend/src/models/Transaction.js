const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionRef: { type: String, required: true, unique: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipientName: { type: String },
  recipientAccount: { type: String },

  type: {
    type: String,
    enum: [
      'transfer', 'deposit', 'withdrawal',
      'orange_money', 'mobile_money',
      'pix', 'iban', 'bank_transfer',
      'payment', 'refund', 'fee'
    ],
    required: true,
  },

  amount: { type: Number, required: true },
  fee: { type: Number, default: 0 },
  totalAmount: { type: Number },
  currency: { type: String, default: 'XOF', enum: ['XOF', 'EUR', 'USD', 'BRL'] },
  exchangeRate: { type: Number },
  convertedAmount: { type: Number },
  convertedCurrency: { type: String },

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending',
  },

  paymentMethod: {
    type: String,
    enum: ['orange_money', 'mobile_money', 'bank_transfer', 'pix', 'iban', 'wallet'],
    required: true,
  },

  description: { type: String, trim: true, maxlength: 200 },
  category: {
    type: String,
    enum: [
      'alimentacao', 'transporte', 'moradia', 'saude',
      'educacao', 'lazer', 'servicos', 'compras',
      'transferencia', 'salario', 'investimento', 'outros'
    ],
    default: 'outros',
  },

  // Dados específicos do método
  paymentDetails: {
    orangeMoneyId: String,
    mobileMoneyId: String,
    pixKey: String,
    iban: String,
    swift: String,
    bankReference: String,
  },

  // Metadata
  ipAddress: String,
  userAgent: String,
  location: {
    lat: Number,
    lng: Number,
    city: String,
    country: String,
  },
  deviceId: String,

  // Comprovante
  receiptGenerated: { type: Boolean, default: false },
  receiptUrl: String,

  // Reversão
  reversedAt: Date,
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reversalReason: String,

  completedAt: Date,
  failedAt: Date,
  failureReason: String,

}, { timestamps: true });

transactionSchema.index({ transactionRef: 1 });
transactionSchema.index({ sender: 1, createdAt: -1 });
transactionSchema.index({ recipient: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ createdAt: -1 });

transactionSchema.pre('save', function (next) {
  if (this.isModified('amount') && !this.totalAmount) {
    this.totalAmount = this.amount + (this.fee || 0);
  }
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
