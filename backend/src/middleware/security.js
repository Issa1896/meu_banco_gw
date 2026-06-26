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
  apiLimiter,
  transferLimiter,
  validate2FA,
  sanitizeInput,
};
