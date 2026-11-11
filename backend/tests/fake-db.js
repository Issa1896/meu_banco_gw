/**
 * Banco falso em memória para testar a lógica de transferência sem MongoDB.
 *
 * Reproduz o que importa para dinheiro:
 *  - findOneAndUpdate/updateOne com filtro e $inc/$set aplicados de forma
 *    ATÔMICA (verificação + escrita no mesmo passo, como no Mongo);
 *  - transações: cada escrita feita com `session` registra como desfazê-la,
 *    e um erro dentro de withTransaction desfaz tudo (rollback);
 *  - índice único (sender, idempotencyKey) → erro 11000.
 * Cada operação cede o event loop antes de executar, para que requisições
 * concorrentes realmente se intercalem.
 */
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Transaction = require('../src/models/Transaction');
const Notification = require('../src/models/Notification');
const AuditLog = require('../src/models/AuditLog');
const JournalEntry = require('../src/models/JournalEntry');
const { query } = require('./helpers');

const tick = () => new Promise((r) => setImmediate(r));
const sameId = (a, b) => String(a) === String(b);

const matches = (doc, filter = {}) => Object.entries(filter).every(([k, cond]) => {
  if (k === '$or') return cond.some((f) => matches(doc, f));
  const v = doc[k];
  if (cond && typeof cond === 'object' && !(cond instanceof mongoose.Types.ObjectId)) {
    if ('$gte' in cond) return v >= cond.$gte;
    if ('$gt' in cond) return v > cond.$gt;
    if ('$ne' in cond) return String(v) !== String(cond.$ne);
    if ('$type' in cond) return typeof v === cond.$type;
  }
  return v instanceof mongoose.Types.ObjectId || cond instanceof mongoose.Types.ObjectId
    ? sameId(v, cond) : v === cond;
});

// Rollback de $inc é o $inc inverso (não restaura o valor absoluto, que
// apagaria escritas de outras transações concorrentes já confirmadas).
const applyUpdate = (doc, update, session) => {
  const before = {};
  Object.keys(update.$set || {}).forEach((k) => { before[k] = doc[k]; });
  Object.entries(update.$inc || {}).forEach(([k, d]) => { doc[k] += d; });
  Object.entries(update.$set || {}).forEach(([k, v]) => { doc[k] = v; });
  if (session) {
    session.undo.push(() => {
      Object.entries(update.$inc || {}).forEach(([k, d]) => { doc[k] -= d; });
      Object.assign(doc, before);
    });
  }
};

const createFakeDb = ({ users }) => {
  const db = { users, transactions: [], notifications: [], journal: [] };

  // ---- sessões / transações
  jest.spyOn(mongoose, 'startSession').mockImplementation(async () => {
    const session = {
      undo: [],
      async withTransaction(fn) {
        this.undo = [];
        try {
          await fn(this);
        } catch (err) {
          this.undo.reverse().forEach((u) => u());
          this.undo = [];
          throw err;
        }
      },
      async endSession() {},
    };
    return session;
  });

  // ---- User
  jest.spyOn(User, 'findOne').mockImplementation((filter) => query(db.users.find((u) => matches(u, filter)) || null));
  jest.spyOn(User, 'findById').mockImplementation((id) => query(db.users.find((u) => sameId(u._id, id)) || null));
  jest.spyOn(User, 'findOneAndUpdate').mockImplementation(async (filter, update, opts = {}) => {
    await tick();
    const doc = db.users.find((u) => matches(u, filter));
    if (!doc) return null;
    applyUpdate(doc, update, opts.session);
    return doc;
  });
  jest.spyOn(User, 'updateOne').mockImplementation(async (filter, update, opts = {}) => {
    await tick();
    const doc = db.users.find((u) => matches(u, filter));
    if (doc) applyUpdate(doc, update, opts.session);
    return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
  });

  // ---- Transaction
  const saveTx = (tx, session) => {
    // validação real do schema (inteiros, enums, obrigatórios)
    const err = tx.validateSync();
    if (err) throw err;
    if (tx.idempotencyKey && db.transactions.some((t) => sameId(t.sender, tx.sender)
      && t.idempotencyKey === tx.idempotencyKey)) {
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
    db.transactions.push(tx);
    if (session) session.undo.push(() => { db.transactions = db.transactions.filter((t) => t !== tx); });
  };

  jest.spyOn(Transaction, 'create').mockImplementation(async (docs, opts = {}) => {
    await tick();
    const list = (Array.isArray(docs) ? docs : [docs]).map((d) => {
      const tx = new Transaction(d);
      tx.save = jest.fn(async () => tx);
      return tx;
    });
    list.forEach((tx) => saveTx(tx, opts.session));
    return list;
  });
  jest.spyOn(Transaction, 'findOne').mockImplementation((filter) => query(db.transactions.find((t) => matches(t, filter)) || null));
  jest.spyOn(Transaction, 'findOneAndUpdate').mockImplementation(async (filter, update, opts = {}) => {
    await tick();
    const doc = db.transactions.find((t) => matches(t, filter));
    if (!doc) return null;
    applyUpdate(doc, update, opts.session);
    return doc;
  });

  // ---- JournalEntry (livro-razão)
  jest.spyOn(JournalEntry, 'create').mockImplementation(async (docs, opts = {}) => {
    await tick();
    const list = (Array.isArray(docs) ? docs : [docs]).map((d) => new JournalEntry(d));
    list.forEach((e) => {
      const err = e.validateSync(); // valida partidas dobradas de verdade
      if (err) throw err;
    });
    db.journal.push(...list);
    if (opts.session) {
      opts.session.undo.push(() => { db.journal = db.journal.filter((e) => !list.includes(e)); });
    }
    return list;
  });
  // Mesmo resultado do pipeline $unwind lines → $group por conta
  jest.spyOn(JournalEntry, 'aggregate').mockImplementation(async () => {
    const acc = new Map();
    db.journal.forEach((e) => e.lines.forEach((l) => {
      const row = acc.get(l.account) || { _id: l.account, debit: 0, credit: 0, entries: 0 };
      row.debit += l.debit || 0;
      row.credit += l.credit || 0;
      row.entries += 1;
      acc.set(l.account, row);
    }));
    return [...acc.values()].sort((a, b) => a._id.localeCompare(b._id));
  });
  jest.spyOn(JournalEntry, 'find').mockImplementation((filter) => {
    const account = filter['lines.account'];
    let rows = db.journal.filter((e) => e.lines.some((l) => l.account === account))
      .sort((a, b) => b.postedAt - a.postedAt).map((e) => e.toObject());
    const q = {
      sort() { return q; },
      skip(n) { rows = rows.slice(n); return q; },
      limit(n) { rows = rows.slice(0, n); return q; },
      lean() { return Promise.resolve(rows); },
    };
    return q;
  });
  jest.spyOn(User, 'find').mockImplementation(() => ({
    select() { return this; },
    lean: () => Promise.resolve(db.users.map((u) => ({
      _id: u._id, name: u.name, accountNumber: u.accountNumber, balance: u.balance,
    }))),
  }));

  // ---- Notification / AuditLog
  jest.spyOn(Notification, 'insertMany').mockImplementation(async (docs, opts = {}) => {
    await tick();
    db.notifications.push(...docs);
    if (opts.session) opts.session.undo.push(() => { db.notifications.splice(-docs.length, docs.length); });
    return docs;
  });
  jest.spyOn(AuditLog, 'create').mockResolvedValue({});

  return db;
};

module.exports = { createFakeDb };
