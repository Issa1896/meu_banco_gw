const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  documentId: { type: String, sparse: true },
  accountNumber: { type: String, unique: true, sparse: true },
  balance: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'XOF', enum: ['XOF', 'EUR', 'USD', 'BRL'] },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  status: { type: String, enum: ['pending', 'active', 'suspended', 'blocked'], default: 'pending' },

  // Biometria
  biometricEnabled: { type: Boolean, default: false },
  biometricPublicKey: { type: String },

  // 2FA
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  twoFactorMethod: { type: String, enum: ['app', 'sms', 'email'] },

  // Segurança
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLogin: { type: Date },
  devices: [{
    deviceId: String,
    name: String,
    lastAccess: Date,
    trusted: { type: Boolean, default: false },
  }],

  // Preferências
  preferences: {
    language: { type: String, default: 'pt', enum: ['pt', 'en', 'fr', 'es'] },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    theme: { type: String, default: 'light', enum: ['light', 'dark'] },
  },

  // KYC
  kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  kycDocuments: [{
    type: { type: String, enum: ['id_card', 'passport', 'proof_of_address'] },
    fileUrl: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    uploadedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],

  // Contas bancárias vinculadas
  linkedBankAccounts: [{
    bankName: String,
    accountNumber: String,
    iban: String,
    swift: String,
    isVerified: { type: Boolean, default: false },
  }],

  // Endereço
  address: {
    street: String,
    city: String,
    region: String,
    country: { type: String, default: 'Guiné-Bissau' },
    postalCode: String,
  },

  refreshToken: { type: String },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,

}, { timestamps: true });

userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ accountNumber: 1 });
userSchema.index({ status: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.twoFactorSecret;
  delete obj.refreshToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
