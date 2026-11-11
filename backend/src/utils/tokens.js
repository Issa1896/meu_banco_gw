const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Tokens tipados. Cada tipo tem segredo e duração próprios, e a verificação
 * exige o tipo esperado — assim um refresh token ou um token de MFA nunca
 * funciona como token de acesso.
 */
const TOKEN_TYPES = {
  access: {
    secret: () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
    expiresIn: () => process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  },
  refresh: {
    secret: () => process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}:refresh`,
    expiresIn: () => process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  mfa_pending: {
    secret: () => process.env.JWT_MFA_SECRET || `${process.env.JWT_SECRET}:mfa`,
    expiresIn: () => '5m',
  },
};

const getConfig = (type) => {
  const cfg = TOKEN_TYPES[type];
  if (!cfg) throw new Error(`Tipo de token desconhecido: ${type}`);
  const secret = cfg.secret();
  if (!secret || secret.startsWith('undefined')) throw new Error('Segredo JWT não configurado');
  return { secret, expiresIn: cfg.expiresIn() };
};

const signToken = (type, payload) => {
  const { secret, expiresIn } = getConfig(type);
  return jwt.sign({ ...payload, type }, secret, {
    expiresIn,
    jwtid: crypto.randomUUID(),
  });
};

const verifyToken = (token, expectedType) => {
  const { secret } = getConfig(expectedType);
  const decoded = jwt.verify(token, secret);
  if (decoded.type !== expectedType) {
    const err = new Error('Tipo de token inválido');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return decoded;
};

const generateAuthTokens = (user) => ({
  accessToken: signToken('access', { id: user._id.toString(), role: user.role }),
  refreshToken: signToken('refresh', { id: user._id.toString() }),
});

/** Hash usado para guardar tokens opacos (refresh, reset) no banco. */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Comparação em tempo constante de dois hashes hex. */
const safeEqualHex = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};

module.exports = { signToken, verifyToken, generateAuthTokens, hashToken, safeEqualHex };
