const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/encryption');
const { sendMail } = require('../utils/mailer');
const {
  signToken, verifyToken, generateAuthTokens, hashToken, safeEqualHex,
} = require('../utils/tokens');

const MAX_LOGIN_ATTEMPTS = 5;
const MAX_2FA_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const GENERIC_RESET_MESSAGE = 'Se o email estiver cadastrado, você receberá as instruções de redefinição';

/** Emite access + refresh e guarda somente o hash do refresh no usuário. */
const issueSession = (user) => {
  const tokens = generateAuthTokens(user);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  return tokens;
};

/** Verifica um código TOTP contra um segredo cifrado. */
const verifyTotp = (encryptedSecret, token) => {
  if (!encryptedSecret || !/^\d{6}$/.test(String(token || ''))) return false;
  return speakeasy.totp.verify({
    secret: decrypt(encryptedSecret),
    encoding: 'base32',
    token: String(token),
    window: 1, // ±30 s de tolerância de relógio
  });
};

// Hash bcrypt (mesmo custo do model) usado só para igualar o tempo de resposta
// quando o email não existe, evitando enumeração de contas por timing.
let dummyHash = null;
const bcryptDummyCompare = async (password) => {
  if (!dummyHash) dummyHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
  return bcrypt.compare(String(password || ''), dummyHash);
};

const audit = (data) => AuditLog.create(data).catch((err) => logger.error('Falha no AuditLog:', err));

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

    const tokens = issueSession(user);
    await user.save();

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
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Mesmo custo de bcrypt para não revelar se o email existe (timing)
      await bcryptDummyCompare(password);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (user.isLocked()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada. Tente novamente mais tarde' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.loginAttempts = 0;
      }
      await user.save();
      audit({
        user: user._id, action: 'LOGIN_FAILED', resource: 'User', resourceId: user._id,
        status: 'failure', severity: 'warning', ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;

    if (user.twoFactorEnabled) {
      await user.save();
      // Token de curta duração que prova que a etapa da senha foi concluída.
      // Só ele é aceito em /verify-2fa — o userId sozinho não basta.
      const mfaToken = signToken('mfa_pending', { id: user._id.toString() });
      return res.json({ requires2FA: true, mfaToken, message: 'Código 2FA necessário' });
    }

    user.lastLogin = new Date();
    const tokens = issueSession(user);
    await user.save();

    audit({
      user: user._id, action: 'USER_LOGIN', resource: 'User', resourceId: user._id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Login realizado com sucesso', user: user.toJSON(), ...tokens });
  } catch (error) {
    logger.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
};

exports.verify2FA = async (req, res) => {
  try {
    const { mfaToken, token } = req.body;
    if (!mfaToken || !token) {
      return res.status(400).json({ error: 'mfaToken e código são obrigatórios' });
    }

    let decoded;
    try {
      decoded = verifyToken(mfaToken, 'mfa_pending');
    } catch {
      return res.status(401).json({ error: 'Sessão de login expirada. Entre novamente' });
    }

    const user = await User.findById(decoded.id).select('+twoFactorSecret');
    if (!user || !user.twoFactorEnabled) {
      return res.status(401).json({ error: 'Sessão de login inválida' });
    }

    if (user.twoFactorLockUntil && user.twoFactorLockUntil > Date.now()) {
      return res.status(423).json({ error: 'Muitas tentativas de 2FA. Tente novamente mais tarde' });
    }

    if (!verifyTotp(user.twoFactorSecret, token)) {
      user.twoFactorFailedAttempts += 1;
      if (user.twoFactorFailedAttempts >= MAX_2FA_ATTEMPTS) {
        user.twoFactorLockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.twoFactorFailedAttempts = 0;
      }
      await user.save();
      audit({
        user: user._id, action: '2FA_FAILED', resource: 'User', resourceId: user._id,
        status: 'failure', severity: 'warning', ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Código 2FA inválido' });
    }

    user.twoFactorFailedAttempts = 0;
    user.twoFactorLockUntil = undefined;
    user.lastLogin = new Date();
    const tokens = issueSession(user);
    await user.save();

    audit({
      user: user._id, action: 'USER_LOGIN', resource: 'User', resourceId: user._id,
      details: { mfa: true }, ipAddress: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ message: '2FA verificado com sucesso', user: user.toJSON(), ...tokens });
  } catch (error) {
    logger.error('Erro na verificação 2FA:', error);
    res.status(500).json({ error: 'Erro na verificação 2FA' });
  }
};

exports.setup2FA = async (req, res) => {
  try {
    if (req.user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA já está ativo' });
    }

    const secret = speakeasy.generateSecret({ name: `MeuBancoGW:${req.user.email}` });

    // O segredo fica no servidor (cifrado) até ser confirmado em /2fa/enable
    req.user.twoFactorPendingSecret = encrypt(secret.base32);
    req.user.twoFactorPendingExpires = new Date(Date.now() + 10 * 60 * 1000);
    await req.user.save();

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32, // exibido uma vez para digitação manual no app
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
    const { token } = req.body;
    const user = await User.findById(req.user._id)
      .select('+twoFactorPendingSecret +twoFactorPendingExpires');

    if (!user.twoFactorPendingSecret || !user.twoFactorPendingExpires
      || user.twoFactorPendingExpires < new Date()) {
      return res.status(400).json({ error: 'Configuração de 2FA expirada. Comece novamente' });
    }

    if (!verifyTotp(user.twoFactorPendingSecret, token)) {
      return res.status(400).json({ error: 'Código de verificação inválido' });
    }

    user.twoFactorEnabled = true;
    user.twoFactorMethod = 'app';
    user.twoFactorSecret = user.twoFactorPendingSecret;
    user.twoFactorPendingSecret = undefined;
    user.twoFactorPendingExpires = undefined;
    await user.save();

    audit({
      user: user._id, action: '2FA_ENABLED', resource: 'User', resourceId: user._id,
      severity: 'warning', ipAddress: req.ip,
    });

    res.json({ message: '2FA ativado com sucesso' });
  } catch (error) {
    logger.error('Erro ao ativar 2FA:', error);
    res.status(500).json({ error: 'Erro ao ativar 2FA' });
  }
};

exports.disable2FA = async (req, res) => {
  try {
    const { password, token } = req.body;
    const user = await User.findById(req.user._id).select('+twoFactorSecret');

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA não está ativo' });
    }

    // Desativar 2FA exige senha + código atual
    const passwordOk = typeof password === 'string' && await user.comparePassword(password);
    if (!passwordOk || !verifyTotp(user.twoFactorSecret, token)) {
      audit({
        user: user._id, action: '2FA_DISABLE_FAILED', resource: 'User', resourceId: user._id,
        status: 'failure', severity: 'warning', ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Senha ou código 2FA inválidos' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorMethod = undefined;
    await user.save();

    audit({
      user: user._id, action: '2FA_DISABLED', resource: 'User', resourceId: user._id,
      severity: 'warning', ipAddress: req.ip,
    });

    res.json({ message: '2FA desativado' });
  } catch (error) {
    logger.error('Erro ao desativar 2FA:', error);
    res.status(500).json({ error: 'Erro ao desativar 2FA' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ error: 'Refresh token é obrigatório' });
    }

    const decoded = verifyToken(refreshToken, 'refresh');
    const user = await User.findById(decoded.id).select('+refreshTokenHash');

    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    if (!safeEqualHex(user.refreshTokenHash, hashToken(refreshToken))) {
      // Refresh token antigo reapresentado: possível roubo. Encerra a sessão.
      user.refreshTokenHash = undefined;
      await user.save();
      audit({
        user: user._id, action: 'REFRESH_TOKEN_REUSE', resource: 'User', resourceId: user._id,
        status: 'failure', severity: 'critical', ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    const tokens = issueSession(user); // rotação: o refresh anterior deixa de valer
    await user.save();

    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

exports.logout = async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $unset: { refreshTokenHash: 1 } });

    audit({ user: req.user._id, action: 'USER_LOGOUT', resource: 'User', resourceId: req.user._id });

    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Resposta idêntica exista ou não o email (evita enumeração de contas)
    if (!user || user.status === 'blocked') {
      return res.json({ message: GENERIC_RESET_MESSAGE });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = hashToken(resetToken); // só o hash vai para o banco
    user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
    const link = `${baseUrl}/reset-password?token=${resetToken}`;

    try {
      await sendMail({
        to: user.email,
        subject: 'MeuBanco GW — redefinição de senha',
        text: `Olá, ${user.name}.\n\nPara redefinir sua senha, acesse (válido por 30 minutos):\n${link}\n\nSe não foi você, ignore este email.`,
      });
    } catch (mailError) {
      logger.error('Falha ao enviar email de reset:', mailError);
    }

    audit({
      user: user._id, action: 'PASSWORD_RESET_REQUESTED', resource: 'User', resourceId: user._id,
      severity: 'warning', ipAddress: req.ip,
    });

    res.json({ message: GENERIC_RESET_MESSAGE });
  } catch (error) {
    logger.error('Erro no forgot-password:', error);
    res.status(500).json({ error: 'Erro ao solicitar reset de senha' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
    }

    const { token, password } = req.body;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    const user = await User.findOne({
      passwordResetToken: hashToken(token),
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    user.password = password; // o hook do model atualiza passwordChangedAt
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokenHash = undefined; // encerra sessões existentes
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    audit({
      user: user._id, action: 'PASSWORD_RESET', resource: 'User', resourceId: user._id,
      severity: 'warning', ipAddress: req.ip,
    });

    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    logger.error('Erro no reset-password:', error);
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

// Biometria (WebAuthn) desativada até existir verificação criptográfica real
// (challenge no servidor + verifyAuthenticationResponse com @simplewebauthn/server).
// A versão anterior emitia tokens de qualquer email sem validar assinatura.
const biometricNotAvailable = (req, res) => res.status(501).json({
  error: 'Autenticação biométrica temporariamente indisponível',
});
exports.registerBiometricKey = biometricNotAvailable;
exports.loginBiometric = biometricNotAvailable;

exports.deleteAccount = async (req, res) => {
  try {
    req.user.status = 'blocked';
    req.user.refreshTokenHash = undefined;
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
