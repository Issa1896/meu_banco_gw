const mongoose = require('mongoose');
const { isIntegerXOF } = require('../utils/money');

/**
 * Lançamento contábil de partidas dobradas (livro-razão).
 *
 * Contas (string):
 *   user:<userId>        carteira do cliente — PASSIVO do banco (saldo = créditos − débitos)
 *   system:fees          receita de taxas
 *   system:opening       contrapartida de saldos de abertura / migração
 *   system:adjustments   contrapartida de ajustes manuais autorizados
 *
 * Regras garantidas pelo schema:
 *   - pelo menos 2 linhas; cada linha tem débito OU crédito, inteiro > 0 em XOF;
 *   - soma dos débitos = soma dos créditos;
 *   - imutável: não se edita nem se apaga. Erro se corrige com novo lançamento.
 */
const ACCOUNT_RE = /^(user:[a-f0-9]{24}|system:(fees|opening|adjustments))$/;

const lineSchema = new mongoose.Schema({
  account: { type: String, required: true, match: ACCOUNT_RE },
  debit: { type: Number, default: 0, min: 0, validate: isIntegerXOF },
  credit: { type: Number, default: 0, min: 0, validate: isIntegerXOF },
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  journalRef: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['transfer', 'refund', 'opening_balance', 'adjustment'],
    required: true,
  },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  lines: { type: [lineSchema], required: true },
  currency: { type: String, default: 'XOF', enum: ['XOF'] },
  description: { type: String, maxlength: 300 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  postedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: true, updatedAt: false } });

journalEntrySchema.index({ 'lines.account': 1, postedAt: -1 });
journalEntrySchema.index({ transaction: 1 });

/** Lança erro descritivo se as linhas não formarem partidas dobradas válidas. */
const assertBalancedLines = (lines) => {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('Lançamento precisa de pelo menos 2 linhas');
  }
  let debits = 0;
  let credits = 0;
  lines.forEach((l) => {
    const d = l.debit || 0;
    const c = l.credit || 0;
    if ((d > 0) === (c > 0)) throw new Error('Cada linha deve ter débito OU crédito (positivo)');
    debits += d;
    credits += c;
  });
  if (debits !== credits) {
    throw new Error(`Lançamento desbalanceado: débitos ${debits} ≠ créditos ${credits}`);
  }
  return true;
};

journalEntrySchema.path('lines').validate({
  validator: assertBalancedLines,
  // Mostra o motivo exato (o Mongoose usaria uma mensagem genérica)
  message: (props) => (props.reason ? props.reason.message : 'Lançamento inválido'),
});

// ---- Imutabilidade
journalEntrySchema.pre('save', function blockEdits(next) {
  if (!this.isNew) return next(new Error('Lançamentos contábeis são imutáveis'));
  return next();
});

const immutable = function blockQuery(next) {
  next(new Error('Lançamentos contábeis são imutáveis'));
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
  'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) => {
  journalEntrySchema.pre(op, immutable);
});
journalEntrySchema.pre('deleteOne', { document: true, query: false }, immutable);

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
module.exports.ACCOUNT_RE = ACCOUNT_RE;
