const request = require('supertest');
const { app } = require('../src/app');
const { generateAuthTokens } = require('../src/utils/tokens');
const { makeUser } = require('./helpers');
const { createFakeDb } = require('./fake-db');

let db;
let alice;
let bob;
let admin;
let superadmin;
let n = 0;

const auth = (u) => ({ Authorization: `Bearer ${generateAuthTokens(u).accessToken}` });
const acct = (u) => `user:${u._id}`;
const transfer = (amount, extra = {}) => request(app).post('/api/transactions/transfer').set(auth(alice))
  .send({ recipientAccount: bob.accountNumber, amount, currency: 'XOF', paymentMethod: 'wallet', ...extra });
const adjust = (who, body) => request(app).post('/api/admin/ledger/adjustments').set(auth(who)).send(body);
const reconcile = () => request(app).get('/api/admin/ledger/reconciliation').set(auth(admin));

beforeEach(async () => {
  n += 1;
  const mk = (p, extra) => makeUser({
    email: `${p}${n}@ex.gw`, phone: `+245${p.length}${String(n).padStart(7, '0')}`, accountNumber: `GW${p}${n}`, ...extra,
  });
  alice = await mk('alice');
  bob = await mk('bob');
  admin = await mk('adm', { role: 'admin' });
  superadmin = await mk('superadm', { role: 'superadmin' });
  db = createFakeDb({ users: [alice, bob, admin, superadmin] });

  // Todo saldo entra pelo razão: abertura de 10.000 para Alice
  const res = await adjust(superadmin, { userId: String(alice._id), amount: 10000, reason: 'Depósito inicial em agência' });
  expect(res.status).toBe(201);
});

describe('lançamentos', () => {
  test('ajuste credita o cliente contra system:adjustments', () => {
    expect(alice.balance).toBe(10000);
    expect(db.journal).toHaveLength(1);
    expect(db.journal[0].lines.map((l) => l.toObject())).toEqual([
      { account: 'system:adjustments', debit: 10000, credit: 0 },
      { account: acct(alice), debit: 0, credit: 10000 },
    ]);
  });

  test('transferência gera um lançamento: remetente, destinatário e taxa', async () => {
    await transfer(1000);
    const entry = db.journal[1];
    expect(entry.type).toBe('transfer');
    expect(String(entry.transaction)).toBe(String(db.transactions[0]._id));
    expect(entry.lines.map((l) => l.toObject())).toEqual([
      { account: acct(alice), debit: 1010, credit: 0 },
      { account: acct(bob), debit: 0, credit: 1000 },
      { account: 'system:fees', debit: 0, credit: 10 },
    ]);
  });

  test('transferência recusada não deixa lançamento', async () => {
    const res = await transfer(9999);
    expect(res.status).toBe(400);
    expect(db.journal).toHaveLength(1);
  });

  test('estorno gera lançamento "refund"', async () => {
    await transfer(1000);
    const res = await request(app).post(`/api/admin/transactions/${db.transactions[0]._id}/reverse`)
      .set(auth(admin)).send({ reason: 'Erro operacional confirmado' });
    expect(res.status).toBe(200);
    expect(db.journal[2].type).toBe('refund');
    expect(db.journal[2].lines.map((l) => l.toObject())).toEqual([
      { account: acct(bob), debit: 1000, credit: 0 },
      { account: acct(alice), debit: 0, credit: 1000 },
    ]);
  });
});

describe('conciliação e balancete', () => {
  test('após transferências, estorno e concorrência: razão = saldos', async () => {
    await transfer(1000);
    await Promise.all(Array.from({ length: 8 }, () => transfer(2500)));
    await request(app).post(`/api/admin/transactions/${db.transactions[0]._id}/reverse`)
      .set(auth(admin)).send({ reason: 'Erro operacional confirmado' });

    const res = await reconcile();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, balanced: true, mismatches: [] });

    const tb = await request(app).get('/api/admin/ledger/trial-balance').set(auth(admin));
    expect(tb.body.balanced).toBe(true);
    const fees = tb.body.accounts.find((a) => a.account === 'system:fees');
    expect(fees.balance).toBe(10 + 25 * 3); // 1 de 1000 + 3 de 2500 que couberam no saldo
  });

  test('saldo alterado fora do razão é detectado (409)', async () => {
    alice.balance += 500; // ex.: alguém editou o banco direto
    const res = await reconcile();
    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.mismatches).toEqual([expect.objectContaining({
      accountNumber: alice.accountNumber, cachedBalance: 10500, ledgerBalance: 10000, difference: 500,
    })]);
  });
});

describe('ajustes manuais', () => {
  test('somente superadmin', async () => {
    const res = await adjust(admin, { userId: String(bob._id), amount: 500, reason: 'Tentativa de admin comum' });
    expect(res.status).toBe(403);
    expect(bob.balance).toBe(0);
  });

  test('débito maior que o saldo é recusado e nada é lançado', async () => {
    const res = await adjust(superadmin, { userId: String(alice._id), amount: -20000, reason: 'Correção de lançamento duplicado' });
    expect(res.status).toBe(400);
    expect(alice.balance).toBe(10000);
    expect(db.journal).toHaveLength(1);
  });

  test('exige valor inteiro e motivo', async () => {
    expect((await adjust(superadmin, { userId: String(bob._id), amount: 10.5, reason: 'Motivo suficientemente longo' })).status).toBe(400);
    expect((await adjust(superadmin, { userId: String(bob._id), amount: 100, reason: 'curto' })).status).toBe(400);
  });
});

describe('extratos', () => {
  test('cliente vê o próprio extrato do razão', async () => {
    await transfer(1000);
    const res = await request(app).get('/api/transactions/statement').set(auth(alice));
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries.map((e) => [e.type, e.debit, e.credit]).sort()).toEqual([
      ['adjustment', 0, 10000],
      ['transfer', 1010, 0],
    ]);
  });

  test('admin consulta extrato de conta do sistema; conta inválida é 400', async () => {
    await transfer(1000);
    const ok = await request(app).get('/api/admin/ledger/accounts/system:fees/statement').set(auth(admin));
    expect(ok.body.entries).toEqual([expect.objectContaining({ type: 'transfer', credit: 10 })]);
    const bad = await request(app).get('/api/admin/ledger/accounts/qualquer/statement').set(auth(admin));
    expect(bad.status).toBe(400);
  });
});

describe('atomicidade com o razão', () => {
  test('se o lançamento contábil falhar, a transferência é desfeita por completo', async () => {
    const JournalEntry = require('../src/models/JournalEntry');
    JournalEntry.create.mockImplementationOnce(async () => { throw new Error('falha de escrita no razão'); });

    const res = await transfer(1000);
    expect(res.status).toBe(500);
    expect(alice.balance).toBe(10000);
    expect(bob.balance).toBe(0);
    expect(db.transactions).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
    expect((await reconcile()).body.ok).toBe(true);
  });
});

describe('migração de saldos antigos (backfill)', () => {
  test('simula, aplica e é idempotente', async () => {
    const ledger = require('../src/services/ledgerService');
    bob.balance = 700; // saldo antigo, sem lançamento no razão

    const dry = await ledger.backfillOpeningBalances();
    expect(dry.changes).toEqual([expect.objectContaining({ accountNumber: bob.accountNumber, diff: 700 })]);
    expect(db.journal).toHaveLength(1); // simulação não grava

    await ledger.backfillOpeningBalances({ apply: true });
    expect(bob.balance).toBe(700); // saldo não muda
    expect((await reconcile()).body.ok).toBe(true);

    const again = await ledger.backfillOpeningBalances({ apply: true });
    expect(again.changes).toEqual([]);
  });
});
