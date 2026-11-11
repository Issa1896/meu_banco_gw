const { verifyToken } = require('../utils/tokens');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de acesso não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    // Só tokens do tipo "access" são aceitos (refresh/MFA são rejeitados)
    const decoded = verifyToken(token, 'access');

    const user = await User.findById(decoded.id).select('-password -twoFactorSecret');
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Conta bloqueada ou pendente de ativação' });
    }

    if (user.passwordChangedAt && decoded.iat < user.passwordChangedAt.getTime() / 1000) {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      AuditLog.create({
        user: req.user._id,
        action: 'UNAUTHORIZED_ACCESS',
        resource: req.originalUrl,
        severity: 'warning',
        status: 'failure',
        ipAddress: req.ip,
      }).catch(() => {});
      return res.status(403).json({ error: 'Acesso não autorizado' });
    }
    next();
  };
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token, 'access');
      const user = await User.findById(decoded.id).select('-password -twoFactorSecret');
      if (user && user.status === 'active') req.user = user;
    }
  } catch (e) { /* ignore */ }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };
