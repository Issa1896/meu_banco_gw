require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const i18next = require('i18next');
const i18nextBackend = require('i18next-fs-backend');
const i18nextMiddleware = require('i18next-http-middleware');
const path = require('path');

const { validateEnv, getAllowedOrigins } = require('./config/env');
const { connectDatabase } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { setupSocket } = require('./config/socket');
const { securityHeaders, apiLimiter, sanitizeInput } = require('./middleware/security');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const budgetRoutes = require('./routes/budgets');
const notificationRoutes = require('./routes/notifications');
const ticketRoutes = require('./routes/tickets');
const adminRoutes = require('./routes/admin');

const app = express();

// Necessário atrás de proxy/load balancer para req.ip e rate limit corretos
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
const server = http.createServer(app);

// i18n setup
i18next.use(i18nextBackend).use(i18nextMiddleware.LanguageDetector).init({
  fallbackLng: 'pt',
  preload: ['pt', 'en', 'fr'],
  backend: { loadPath: path.join(__dirname, 'locales', '{{lng}}.json') },
  detection: {
    order: ['querystring', 'cookie', 'header'],
    caches: ['cookie'],
  },
});

// Middleware globais
app.use(securityHeaders);
const allowedOrigins = getAllowedOrigins();
app.use(cors({
  // Lista explícita de origens: "*" com credentials é proibido
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(i18nextMiddleware.handle(i18next));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use('/api', apiLimiter);
app.use(sanitizeInput);

// Rotas públicas
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Inicialização
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    validateEnv();
    await connectDatabase();
    await connectRedis();

    setupSocket(server);

    server.listen(PORT, () => {
      logger.info(`Servidor rodando na porta ${PORT}`);
      logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error('Falha ao iniciar servidor:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, server };
