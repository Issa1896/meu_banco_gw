const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body } = require('express-validator');

const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Muitas requisições. Tente novamente' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Instâncias separadas: cada uma tem seu próprio contador
const makeMfaLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de verificação. Tente novamente em 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false,
});
const mfaLimiter = makeMfaLimiter(); // login: /verify-2fa
const mfaManageLimiter = makeMfaLimiter(); // /2fa/enable e /2fa/disable

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas solicitações de redefinição. Tente novamente mais tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

const transferLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas transferências. Aguarde um momento' },
});

const validate2FA = [
  body('twoFactorCode').isLength({ min: 6, max: 6 }).isNumeric()
    .withMessage('Código 2FA inválido'),
];

const sanitizeInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim().replace(/<[^>]*>/g, '');
      }
    });
  }
  next();
};

module.exports = {
  securityHeaders,
  loginLimiter,
  mfaLimiter,
  mfaManageLimiter,
  passwordResetLimiter,
  apiLimiter,
  transferLimiter,
  validate2FA,
  sanitizeInput,
};
