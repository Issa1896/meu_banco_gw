import { io } from 'socket.io-client';
import Cookies from 'js-cookie';

let socket = null;

export const connectSocket = () => {
  const token = Cookies.get('accessToken') || localStorage.getItem('accessToken');
  if (!token || socket?.connected) return socket;

  socket = io('/', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('Socket conectado');
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket desconectado:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Erro socket:', error.message);
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const subscribeToTransactions = (callback) => {
  if (!socket) return;
  socket.on('transaction:new', callback);
  socket.on('transaction:received', callback);
  socket.on('transaction:update', callback);

  return () => {
    socket.off('transaction:new', callback);
    socket.off('transaction:received', callback);
    socket.off('transaction:update', callback);
  };
};

export const subscribeToNotifications = (callback) => {
  if (!socket) return;
  socket.on('notification:new', callback);

  return () => {
    socket.off('notification:new', callback);
  };
};
