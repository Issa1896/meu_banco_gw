const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  const refreshToken = jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
    }

    const { name, email, phone, password, documentId } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(409).json({ error: 'Email ou telefone já cadastrados' });
    }

    const user = await User.create({
      name, email, phone, password, documentId,
      accountNumber: `GW${Date.now()}${Math.floor(Math.random() * 1000)}`,
    });

    const tokens = generateTokens(user._id, user.role);

    await AuditLog.create({
      user: user._id,
      action: 'USER_REGISTERED',
      resource: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      message: 'Conta criada com sucesso',
      user: user.toJSON(),
      ...tokens,
    });
  } catch (error) {
    logger.error('Erro no registro:', error);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (user.isLocked()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada. Tente novamente mais tarde' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();

    if (user.twoFactorEnabled) {
      user.save();
      return res.json({
        requires2FA: true,
        userId: user._id,
        message: 'Código 2FA necessário',
      });
    }

    const tokens = generateTokens(user._id, user.role);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    await AuditLog.create({
      user: user._id,
      action: 'USER_LOGIN',
      resource: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: 'Login realizado com sucesso',
      user: user.toJSON(),
      ...tokens,
    });
  } catch (error) {
    logger.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
};

exports.verify2FA = async (req, res) => {
  try {
    const { userId, token } = req.body;
    const user = await User.findById(userId);

    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA não configurado' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      return res.status(401).json({ error: 'Código 2FA inválido' });
    }

    const tokens = generateTokens(user._id, user.role);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      message: '2FA verificado com sucesso',
      user: user.toJSON(),
      ...tokens,
    });
  } catch (error) {
    logger.error('Erro na verificação 2FA:', error);
    res.status(500).json({ error: 'Erro na verificação 2FA' });
  }
};

exports.setup2FA = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `MeuBancoGW:${req.user.email}`,
    });

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      message: 'Escaneie o QR Code com seu app autenticador',
    });
  } catch (error) {
    logger.error('Erro no setup 2FA:', error);
    res.status(500).json({ error: 'Erro ao configurar 2FA' });
  }
};

exports.enable2FA = async (req, res) => {
  try {
    const { secret, token } = req.body;

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      return res.status(400).json({ error: 'Código de verificação inválido' });
    }

    req.user.twoFactorEnabled = true;
    req.user.twoFactorSecret = secret;
    await req.user.save();

    await AuditLog.create({
      user: req.user._id,
      action: '2FA_ENABLED',
      resource: 'User',
      resourceId: req.user._id,
      severity: 'warning',
    });

    res.json({ message: '2FA ativado com sucesso' });
  } catch (error) {
    logger.error('Erro ao ativar 2FA:', error);
    res.status(500).json({ error: 'Erro ao ativar 2FA' });
  }
};

exports.disable2FA = async (req, res) => {
  try {
    req.user.twoFactorEnabled = false;
    req.user.twoFactorSecret = undefined;
    await req.user.save();

    await AuditLog.create({
      user: req.user._id,
      action: '2FA_DISABLED',
      resource: 'User',
      resourceId: req.user._id,
      severity: 'warning',
    });

    res.json({ message: '2FA desativado' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao desativar 2FA' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token é obrigatório' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    const tokens = generateTokens(user._id, user.role);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

exports.logout = async (req, res) => {
  try {
    req.user.refreshToken = undefined;
    await req.user.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'USER_LOGOUT',
      resource: 'User',
      resourceId: req.user._id,
    });

    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'Email não encontrado' });
    }

    const resetToken = jwt.sign(
      { id: user._id, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 3600000);
    await user.save();

    // Enviar email com o token
    res.json({ message: 'Instruções de reset enviadas para seu email', resetToken });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao solicitar reset de senha' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'password_reset') {
      return res.status(400).json({ error: 'Token inválido' });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.passwordResetToken !== token) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    if (user.passwordResetExpires < new Date()) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
};

exports.getProfile = async (req, res) => {
  res.json({ user: req.user });
};

exports.updateProfile = async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'address', 'preferences'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ user, message: 'Perfil atualizado' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
};

exports.registerBiometricKey = async (req, res) => {
  try {
    const { publicKey } = req.body;
    req.user.biometricEnabled = true;
    req.user.biometricPublicKey = publicKey;
    await req.user.save();

    res.json({ message: 'Chave biométrica registrada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar biometria' });
  }
};

exports.loginBiometric = async (req, res) => {
  try {
    const { email, biometricSignature } = req.body;

    const user = await User.findOne({ email, biometricEnabled: true });
    if (!user) {
      return res.status(401).json({ error: 'Biometria não configurada' });
    }

    // Verificar assinatura biométrica
    // Em produção, validar com a chave pública armazenada
    const tokens = generateTokens(user._id, user.role);
    user.lastLogin = new Date();
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({ message: 'Login biométrico realizado', ...tokens });
  } catch (error) {
    res.status(500).json({ error: 'Erro no login biométrico' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    req.user.status = 'blocked';
    await req.user.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'ACCOUNT_DELETED',
      resource: 'User',
      resourceId: req.user._id,
      severity: 'critical',
    });

    res.json({ message: 'Conta marcada para exclusão' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
};
