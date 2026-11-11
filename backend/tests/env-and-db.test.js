const mongoose = require('mongoose');

describe('validação de ambiente', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test('produção sem segredos não sobe', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_ACCESS_SECRET;
    const { validateEnv } = require('../src/config/env');
    expect(() => validateEnv()).toThrow('Variáveis de ambiente inválidas');
  });

  test('produção com FRONTEND_URL="*" é recusada', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      JWT_REFRESH_SECRET: 'b'.repeat(40),
      JWT_MFA_SECRET: 'c'.repeat(40),
      ENCRYPTION_KEY: 'd'.repeat(40),
      MONGODB_URI: 'mongodb://db/x',
      FRONTEND_URL: '*',
    });
    const { validateEnv } = require('../src/config/env');
    expect(() => validateEnv()).toThrow();
    process.env.FRONTEND_URL = 'https://app.meubanco.gw';
    expect(() => validateEnv()).not.toThrow();
  });
});

describe('banco de dados', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test('em produção, Mongo indisponível derruba o boot (sem banco em memória/seed)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb://inexistente:27017/x';
    jest.spyOn(mongoose, 'connect').mockRejectedValue(new Error('ECONNREFUSED'));
    const { connectDatabase } = require('../src/config/database');
    await expect(connectDatabase()).rejects.toThrow('ECONNREFUSED');
    expect(mongoose.connect).toHaveBeenCalledTimes(1);
  });
});
