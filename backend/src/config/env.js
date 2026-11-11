const logger = require('../utils/logger');

const PLACEHOLDER_PATTERNS = [/change-in-production/i, /your-/i, /^changeme$/i];

/**
 * Valida variáveis de ambiente no boot. Em produção, falta de segredo ou
 * valor de exemplo impede o servidor de subir.
 */
const validateEnv = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const errors = [];

  const requireSecret = (name, minLength = 32) => {
    const value = process.env[name];
    if (!value) return errors.push(`${name} não definida`);
    if (value.length < minLength) errors.push(`${name} deve ter pelo menos ${minLength} caracteres`);
    if (PLACEHOLDER_PATTERNS.some((p) => p.test(value))) errors.push(`${name} ainda usa o valor de exemplo`);
  };

  if (isProd) {
    requireSecret('JWT_ACCESS_SECRET');
    requireSecret('JWT_REFRESH_SECRET');
    requireSecret('JWT_MFA_SECRET');
    requireSecret('ENCRYPTION_KEY');
    if (!process.env.MONGODB_URI) errors.push('MONGODB_URI não definida');
    if (!process.env.FRONTEND_URL) errors.push('FRONTEND_URL não definida');
    if ((process.env.FRONTEND_URL || '').split(',').some((o) => o.trim() === '*')) {
      errors.push('FRONTEND_URL não pode ser "*" em produção');
    }
  } else {
    if (!process.env.JWT_SECRET && !process.env.JWT_ACCESS_SECRET) {
      errors.push('Defina JWT_SECRET (ou JWT_ACCESS_SECRET) no .env');
    }
    if (!process.env.ENCRYPTION_KEY) errors.push('Defina ENCRYPTION_KEY no .env');
  }

  if (errors.length) {
    errors.forEach((e) => logger.error(`Configuração inválida: ${e}`));
    throw new Error('Variáveis de ambiente inválidas');
  }
};

/** Lista de origens permitidas para CORS / Socket.IO. */
const getAllowedOrigins = () => {
  const raw = process.env.FRONTEND_URL || 'http://localhost:5173';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
};

module.exports = { validateEnv, getAllowedOrigins };
