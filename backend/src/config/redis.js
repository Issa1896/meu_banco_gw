const redis = require('redis');
const logger = require('../utils/logger');

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
    logger.info('Redis conectado');
  } catch (error) {
    logger.warn('Redis não disponível, usando cache em memória');
  }
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
