const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // tamanho recomendado para GCM
const SALT = process.env.ENCRYPTION_SALT || 'meubanco-gw:encryption:v1';

let cachedKey = null;
let cachedSource = null;

/**
 * Deriva a chave uma única vez (scrypt é caro de propósito).
 * Se ENCRYPTION_KEY for 32 bytes em base64, é usada diretamente.
 */
const getKey = () => {
  const source = process.env.ENCRYPTION_KEY;
  if (!source) throw new Error('ENCRYPTION_KEY não configurada');
  if (cachedKey && cachedSource === source) return cachedKey;

  const raw = Buffer.from(source, 'base64');
  cachedKey = raw.length === 32 && raw.toString('base64') === source
    ? raw
    : crypto.scryptSync(source, SALT, 32);
  cachedSource = source;
  return cachedKey;
};

const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decrypt = (encryptedText) => {
  const [ivHex, tagHex, dataHex] = String(encryptedText).split(':');
  if (!ivHex || !tagHex || dataHex === undefined) throw new Error('Texto cifrado inválido');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
};

module.exports = { encrypt, decrypt };
