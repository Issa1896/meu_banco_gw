const mongoose = require('mongoose');
const logger = require('../utils/logger');

let mongoServer = null;

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Banco em memória só em desenvolvimento/teste, e só se permitido.
 * Em produção, se o MongoDB estiver indisponível o servidor NÃO sobe —
 * antes ele subia com banco vazio e um admin de senha conhecida.
 */
const inMemoryAllowed = () => !isProduction() && process.env.ALLOW_IN_MEMORY_DB !== 'false';

const connectDatabase = async () => {
  const uri = process.env.MONGODB_URI || (isProduction() ? null : 'mongodb://localhost:27017/meu-banco');
  if (!uri) throw new Error('MONGODB_URI não definida');

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: isProduction() ? 15000 : 3000,
      connectTimeoutMS: isProduction() ? 15000 : 3000,
    });
    logger.info(`MongoDB conectado: ${conn.connection.host}`);
    return;
  } catch (error) {
    if (!inMemoryAllowed()) {
      logger.error(`Falha ao conectar no MongoDB: ${error.message}`);
      throw error;
    }
    logger.warn(`MongoDB não disponível (${error.message}). Usando banco em memória (somente desenvolvimento)...`);
  }

  // Replica set em memória: transações multi-documento (startTransaction)
  // não funcionam em instância standalone.
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const conn = await mongoose.connect(mongoServer.getUri());
  logger.info(`MongoDB em memória (replica set) iniciado: ${conn.connection.host}`);

  await seedInitialData();
};

async function seedInitialData() {
  if (isProduction()) return;
  const User = require('../models/User');
  const existingAdmin = await User.findOne({ role: 'superadmin' });
  if (existingAdmin) return;

  // Senhas vêm do .env; os padrões existem só para desenvolvimento local
  // e NÃO são escritos no log. Saldos entram pelo livro-razão (abertura).
  const admin = await User.create({
    name: 'Admin MeuBanco',
    email: 'admin@meubanco.gw',
    phone: '+245955000000',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
    role: 'superadmin',
    status: 'active',
    kycStatus: 'verified',
    accountNumber: 'GW000000001',
  });

  const tester = await User.create({
    name: 'Usuário Teste',
    email: 'teste@meubanco.gw',
    phone: '+245955000001',
    password: process.env.SEED_USER_PASSWORD || 'Teste123!',
    role: 'user',
    status: 'active',
    kycStatus: 'verified',
    accountNumber: 'GW000000002',
  });

  const ledger = require('../services/ledgerService');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await ledger.postBalanceChange({
        userId: admin._id, amount: 1000000, type: 'opening_balance', description: 'Saldo inicial (dev)',
      }, session);
      await ledger.postBalanceChange({
        userId: tester._id, amount: 500000, type: 'opening_balance', description: 'Saldo inicial (dev)',
      }, session);
    });
  } finally {
    await session.endSession();
  }

  logger.info('Dados de desenvolvimento criados: admin@meubanco.gw e teste@meubanco.gw (senhas em SEED_*_PASSWORD ou no README)');
}

const disconnectDatabase = async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
};

module.exports = { connectDatabase, disconnectDatabase };
