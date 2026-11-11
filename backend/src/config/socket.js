const socketIO = require('socket.io');
const User = require('../models/User');
const logger = require('../utils/logger');
const { verifyToken } = require('../utils/tokens');
const { getAllowedOrigins } = require('./env');

const ADMIN_ROOM = 'admin:room';
const ADMIN_ROLES = ['admin', 'superadmin'];
const MAX_SUPPORT_MESSAGE = 2000;

let io;

const setupSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e5, // 100 KB por mensagem
  });

  // Autenticação via token de acesso (refresh/MFA são rejeitados)
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Token de autenticação necessário'));
      }

      const decoded = verifyToken(token, 'access');
      const user = await User.findById(decoded.id).select('-password');
      if (!user || user.status !== 'active') {
        return next(new Error('Usuário não autorizado'));
      }

      if (user.passwordChangedAt && decoded.iat < user.passwordChangedAt.getTime() / 1000) {
        return next(new Error('Token expirado'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`Socket conectado: ${userId}`);

    socket.join(`user:${userId}`);
    if (ADMIN_ROLES.includes(socket.user.role)) {
      socket.join(ADMIN_ROOM);
    }

    User.updateOne({ _id: socket.user._id }, { lastSeenAt: new Date() }).catch(() => {});

    // Eventos de transação são emitidos SOMENTE pelo servidor (ver
    // transactionController). O antigo handler "transaction:status" permitia que
    // qualquer cliente enviasse eventos falsos para a sala de outro usuário.

    socket.on('notification:read', (notificationId) => {
      if (typeof notificationId !== 'string') return;
      io.to(`user:${userId}`).emit('notification:updated', { notificationId });
    });

    socket.on('support:message', (data) => {
      const message = typeof data?.message === 'string' ? data.message.trim() : '';
      if (!message || message.length > MAX_SUPPORT_MESSAGE) return;
      io.to(ADMIN_ROOM).emit('support:new', {
        userId,
        userName: socket.user.name,
        message,
        timestamp: new Date(),
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Socket desconectado: ${userId}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO não foi inicializado');
  }
  return io;
};

module.exports = { setupSocket, getIO };
