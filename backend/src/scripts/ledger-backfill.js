/**
 * Migração: cria lançamentos de abertura para saldos que existiam antes do
 * livro-razão (User.balance sem lançamentos correspondentes).
 *
 *   npm run ledger:backfill              → simulação (não grava)
 *   npm run ledger:backfill -- --apply   → grava
 *
 * Idempotente: lança só a diferença; rodar de novo não lança nada.
 * Não altera User.balance. Faça backup antes de usar --apply.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ledger = require('../services/ledgerService');

const main = async () => {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_URI) throw new Error('Defina MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);

  const { changes } = await ledger.backfillOpeningBalances({ apply });
  changes.forEach((c) => console.log(
    `${c.accountNumber}: saldo ${c.cachedBalance}, razão ${c.ledgerBalance}, lançar ${c.diff}`,
  ));
  console.log(changes.length === 0
    ? 'Nada a migrar: razão e saldos já conferem.'
    : `${changes.length} conta(s) ${apply ? 'migradas' : 'a migrar (rode com --apply para gravar)'}.`);

  await mongoose.disconnect();
};

main().catch((err) => { console.error(err); process.exit(1); });
