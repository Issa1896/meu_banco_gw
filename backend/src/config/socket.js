const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

let io;

const setupSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Autenticação via token
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Token de autenticação necessário'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Usuário não encontrado'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket conectado: ${socket.user.email}`);

    // Entrar em salas pessoais
    socket.join(`user:${socket.user._id}`);
    socket.join(`role:${socket.user.role}`);

    // Atualizar status online
    socket.user.lastLogin = new Date();
    socket.user.save().catch(() => {});

    // Eventos de transação
    socket.on('transaction:status', (data) => {
      io.to(`user:${data.userId}`).emit('transaction:update', data);
    });

    // Notificações
    socket.on('notification:read', (notificationId) => {
      io.to(`user:${socket.user._id}`).emit('notification:updated', { notificationId });
    });

    // Chat de suporte
    socket.on('support:message', (data) => {
      io.to(`role:admin`).emit('support:new', {
        userId: socket.user._id,
        userName: socket.user.name,
        message: data.message,
        timestamp: new Date(),
      });
    });

    // Admin - escutar tickets
    if (['admin', 'superadmin'].includes(socket.user.role)) {
      socket.join('admin:room');
    }

    socket.on('disconnect', () => {
      logger.info(`Socket desconectado: ${socket.user.email}`);
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
