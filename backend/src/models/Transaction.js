const mongoose = require('mongoose');
const { isIntegerXOF } = require('../utils/money');

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

  // Valores de liquidação: SEMPRE inteiros em XOF (moeda das carteiras).
  // amount = o que o destinatário recebe; fee = taxa; totalAmount = débito do remetente.
  amount: { type: Number, required: true, min: 1, validate: isIntegerXOF },
  fee: { type: Number, default: 0, min: 0, validate: isIntegerXOF },
  totalAmount: { type: Number, required: true, min: 1, validate: isIntegerXOF },
  currency: { type: String, default: 'XOF', enum: ['XOF'] },

  // O que o usuário digitou e a taxa de câmbio aplicada pelo servidor
  originalAmount: { type: Number },
  originalCurrency: { type: String, enum: ['XOF', 'EUR', 'USD', 'BRL'] },
  exchangeRate: { type: Number },

  // Idempotência: a mesma chave do mesmo remetente nunca gera 2 transferências
  idempotencyKey: { type: String, maxlength: 128 },
  requestHash: { type: String },

  // Estorno: a transação "refund" aponta para a original (e vice-versa)
  relatedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },

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
    provider: String,
    simulated: Boolean,
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

// transactionRef já é indexado por ser "unique"
transactionSchema.index(
  { sender: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
transactionSchema.index({ sender: 1, createdAt: -1 });
transactionSchema.index({ recipient: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ createdAt: -1 });

transactionSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
