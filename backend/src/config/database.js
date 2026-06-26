const mongoose = require('mongoose');
const logger = require('../utils/logger');

let mongoServer = null;

const connectDatabase = async () => {
  let uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/meu-banco';

  // Tentar conectar ao MongoDB real primeiro
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    logger.info(`MongoDB conectado: ${conn.connection.host}`);
    return;
  } catch (error) {
    logger.warn(`MongoDB não disponível (${error.message}). Usando banco em memória...`);
  }

  // Fallback para MongoDB em memória
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create();
    uri = mongoServer.getUri();

    const conn = await mongoose.connect(uri);
    logger.info(`MongoDB em memória iniciado: ${conn.connection.host}`);
    logger.info(`URI: ${uri}`);

    // Criar índices e dados iniciais
    await seedInitialData();
  } catch (memError) {
    logger.error(`Erro ao iniciar MongoDB em memória: ${memError.message}`);
    process.exit(1);
  }
};

async function seedInitialData() {
  const User = require('../models/User');
  const existingAdmin = await User.findOne({ role: 'superadmin' });
  if (!existingAdmin) {
    await User.create({
      name: 'Admin MeuBanco',
      email: 'admin@meubanco.gw',
      phone: '+245955000000',
      password: 'Admin123!',
      role: 'superadmin',
      status: 'active',
      kycStatus: 'verified',
      accountNumber: 'GW000000001',
      balance: 1000000,
    });
    logger.info('Conta admin criada: admin@meubanco.gw / Admin123!');

    await User.create({
      name: 'Usuário Teste',
      email: 'teste@meubanco.gw',
      phone: '+245955000001',
      password: 'Teste123!',
      role: 'user',
      status: 'active',
      kycStatus: 'verified',
      accountNumber: 'GW000000002',
      balance: 500000,
    });
    logger.info('Conta teste criada: teste@meubanco.gw / Teste123!');
  }
}

const disconnectDatabase = async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
};

module.exports = { connectDatabase, disconnectDatabase };
