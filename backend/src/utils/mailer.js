const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
};

/**
 * Envia email. Sem SMTP configurado: em desenvolvimento o conteúdo vai para o
 * log de debug (para testar o fluxo); em produção é erro.
 */
const sendMail = async ({ to, subject, text }) => {
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP não configurado');
    logger.debug(`[email dev] para=${to} assunto="${subject}"\n${text}`);
    return;
  }
  await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
};

module.exports = { sendMail };
