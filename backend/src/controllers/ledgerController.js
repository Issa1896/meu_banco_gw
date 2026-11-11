const mongoose = require('mongoose');
const ledger = require('../services/ledgerService');
const AuditLog = require('../models/AuditLog');
const { ACCOUNT_RE } = require('../models/JournalEntry');
const { MoneyError, MAX_TRANSFER_XOF } = require('../utils/money');
const { pagination } = require('../utils/query');
const logger = require('../utils/logger');

const fail = (res, error, fallback) => {
  if (error instanceof MoneyError) return res.status(error.statusCode).json({ error: error.message });
  logger.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

/** Extrato do próprio cliente, direto do livro-razão. */
exports.myStatement = async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
    const entries = await ledger.statement(ledger.userAccount(req.user._id), { limit, skip });
    res.json({ entries, page, limit, balance: req.user.balance, currency: 'XOF' });
  } catch (error) {
    fail(res, error, 'Erro ao gerar extrato');
  }
};

exports.trialBalance = async (req, res) => {
  try {
    res.json(await ledger.trialBalance());
  } catch (error) {
    fail(res, error, 'Erro ao gerar balancete');
  }
};

exports.reconciliation = async (req, res) => {
  try {
    const report = await ledger.reconcile();
    res.status(report.ok ? 200 : 409).json(report);
  } catch (error) {
    fail(res, error, 'Erro na conciliação');
  }
};

exports.accountStatement = async (req, res) => {
  try {
    const { account } = req.params;
    if (!ACCOUNT_RE.test(account)) return res.status(400).json({ error: 'Conta inválida' });
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
    res.json({ account, page, limit, entries: await ledger.statement(account, { limit, skip }) });
  } catch (error) {
    fail(res, error, 'Erro ao gerar extrato da conta');
  }
};

/** Ajuste manual de saldo — só superadmin, com motivo, auditado. */
exports.createAdjustment = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'userId inválido' });
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_TRANSFER_XOF) {
      return res.status(400).json({ error: `amount deve ser inteiro em XOF, diferente de zero, até ${MAX_TRANSFER_XOF}` });
    }
    const why = typeof reason === 'string' ? reason.trim() : '';
    if (why.length < 10 || why.length > 300) {
      return res.status(400).json({ error: 'Informe o motivo do ajuste (10 a 300 caracteres)' });
    }

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await ledger.postBalanceChange({
          userId, amount, type: 'adjustment', description: why, createdBy: req.user._id,
        }, session);
      });
    } finally {
      await session.endSession();
    }

    AuditLog.create({
      user: req.user._id,
      action: 'LEDGER_ADJUSTMENT',
      resource: 'User',
      resourceId: userId,
      details: { amount, reason: why, journalRef: result.entry.journalRef },
      severity: 'critical',
      ipAddress: req.ip,
    }).catch((err) => logger.error('Falha no AuditLog:', err));

    res.status(201).json({
      message: 'Ajuste lançado',
      journalRef: result.entry.journalRef,
      balance: result.user.balance,
    });
  } catch (error) {
    fail(res, error, 'Erro ao lançar ajuste');
  }
};
