const cron = require('node-cron');
const ledger = require('../services/ledgerService');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/** Executa a conciliação e registra divergências no log e na auditoria. */
const runReconciliation = async () => {
  const report = await ledger.reconcile();
  if (report.ok) {
    logger.info(`Conciliação OK: ${report.usersChecked} contas conferidas`);
  } else {
    logger.error('CONCILIAÇÃO COM DIVERGÊNCIA', { balanced: report.balanced, mismatches: report.mismatches.length });
    await AuditLog.create({
      action: 'LEDGER_RECONCILIATION_FAILED',
      resource: 'Ledger',
      details: { balanced: report.balanced, mismatches: report.mismatches.slice(0, 50) },
      severity: 'critical',
      status: 'failure',
    }).catch((err) => logger.error('Falha no AuditLog:', err));
  }
  return report;
};

/** Agenda a conciliação (padrão: todo dia às 02:17). LEDGER_RECONCILE_CRON=off desliga. */
const scheduleReconciliation = () => {
  const expr = process.env.LEDGER_RECONCILE_CRON || '17 2 * * *';
  if (expr === 'off') return null;
  if (!cron.validate(expr)) {
    logger.error(`LEDGER_RECONCILE_CRON inválida: ${expr}`);
    return null;
  }
  return cron.schedule(expr, () => {
    runReconciliation().catch((err) => logger.error('Erro na conciliação agendada:', err));
  }, { timezone: process.env.TZ || 'Africa/Bissau' });
};

module.exports = { runReconciliation, scheduleReconciliation };
