const request = require('supertest');
const { app } = require('../src/app');
const Transaction = require('../src/models/Transaction');
const { generateAuthTokens } = require('../src/utils/tokens');
const { makeUser } = require('./helpers');
const { createFakeDb } = require('./fake-db');

let db;
let alice;
let bob;
let n = 0;

const auth = (u) => ({ Authorization: `Bearer ${generateAuthTokens(u).accessToken}` });
const transfer = (u, body, headers = {}) => request(app).post('/api/transactions/transfer')
  .set({ ...auth(u), ...headers })
  .send({ recipientAccount: bob.accountNumber, currency: 'XOF', paymentMethod: 'wallet', ...body });

beforeEach(async () => {
  n += 1; // contas novas por teste (o rate limit é por usuário)
  alice = await makeUser({ email: `alice${n}@ex.gw`, phone: `+24595500${String(n).padStart(4, '0')}`, accountNumber: `GWA${n}`, balance: 10000 });
  bob = await makeUser({ email: `bob${n}@ex.gw`, phone: `+24595600${String(n).padStart(4, '0')}`, accountNumber: `GWB${n}`, balance: 0 });
  db = createFakeDb({ users: [alice, bob] });
});

describe('transferência simples', () => {
  test('debita valor + taxa, credita valor, registra e notifica', async () => {
    const res = await transfer(alice, { amount: 1000, category: 'alimentacao' });
    expect(res.status).toBe(201);
    expect(alice.balance).toBe(10000 - 1010);
    expect(bob.balance).toBe(1000);
    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0]).toMatchObject({ amount: 1000, fee: 10, totalAmount: 1010, status: 'completed', category: 'alimentacao' });
    expect(db.notifications).toHaveLength(2);
  });

  test('carteira interna ("wallet") é aceita — antes o validador recusava', async () => {
    const res = await transfer(alice, { amount: 500 });
    expect(res.status).toBe(201);
  });

  test('resposta não expõe IP, user agent nem dispositivo', async () => {
    const res = await transfer(alice, { amount: 1000 }, { 'X-Device-Id': 'dev-123' });
    expect(res.body.transaction.ipAddress).toBeUndefined();
    expect(res.body.transaction.deviceId).toBeUndefined();
    expect(db.transactions[0].deviceId).toBe('dev-123'); // mas fica gravado
  });

  test('saldo insuficiente: nada muda', async () => {
    const res = await transfer(alice, { amount: 9950 }); // 9950 + 100 > 10000
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Saldo insuficiente');
    expect(alice.balance).toBe(10000);
    expect(bob.balance).toBe(0);
    expect(db.transactions).toHaveLength(0);
  });

  test('EUR: debita o equivalente em XOF e grava o câmbio', async () => {
    const res = await transfer(alice, { amount: 10, currency: 'EUR' });
    expect(res.status).toBe(201);
    expect(bob.balance).toBe(6560); // antes: 10 XOF
    expect(alice.balance).toBe(10000 - 6560 - 66);
    expect(db.transactions[0]).toMatchObject({ originalAmount: 10, originalCurrency: 'EUR', currency: 'XOF' });
  });

  test('destinatário bloqueado: 404 e nada debitado', async () => {
    bob.status = 'blocked';
    const res = await transfer(alice, { amount: 1000 });
    expect(res.status).toBe(404);
    expect(alice.balance).toBe(10000);
  });

  test('falha no meio (crédito) desfaz o débito — rollback', async () => {
    const User = require('../src/models/User');
    const real = User.updateOne.getMockImplementation();
    User.updateOne.mockImplementationOnce(async () => ({ matchedCount: 0 }));
    const res = await transfer(alice, { amount: 1000 });
    expect(res.status).toBe(409);
    expect(alice.balance).toBe(10000);
    expect(db.transactions).toHaveLength(0);
    User.updateOne.mockImplementation(real);
  });

  test('para si mesmo é recusado', async () => {
    const res = await transfer(alice, { amount: 1000, recipientAccount: alice.accountNumber });
    expect(res.status).toBe(400);
  });
});

describe('concorrência (gasto duplo)', () => {
  test('10 transferências simultâneas de 3000 com saldo 10000: só 3 passam', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => transfer(alice, { amount: 3000 })));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3);
    expect(alice.balance).toBe(10000 - 3 * 3030);
    expect(alice.balance).toBeGreaterThanOrEqual(0);
    expect(bob.balance).toBe(9000);
    expect(db.transactions).toHaveLength(3);
  });
});

describe('idempotência', () => {
  test('mesma chave duas vezes: um único débito, segunda resposta é replay', async () => {
    const key = { 'Idempotency-Key': `chave-${n}-abcdef` };
    const first = await transfer(alice, { amount: 1000 }, key);
    const second = await transfer(alice, { amount: 1000 }, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.transaction.transactionRef).toBe(first.body.transaction.transactionRef);
    expect(alice.balance).toBe(10000 - 1010);
  });

  test('mesma chave em paralelo (rede instável, clique duplo): um único débito', async () => {
    const key = { 'Idempotency-Key': `paralelo-${n}-abcdef` };
    const results = await Promise.all([1, 2, 3].map(() => transfer(alice, { amount: 1000 }, key)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(alice.balance).toBe(10000 - 1010);
    expect(db.transactions).toHaveLength(1);
  });

  test('mesma chave com dados diferentes: 422', async () => {
    const key = { 'Idempotency-Key': `outra-${n}-abcdef` };
    await transfer(alice, { amount: 1000 }, key);
    const res = await transfer(alice, { amount: 2000 }, key);
    expect(res.status).toBe(422);
    expect(alice.balance).toBe(10000 - 1010);
  });
});

describe('métodos externos', () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = saved; });

  test('em produção, PIX sem integração responde 501 e não debita', async () => {
    process.env.NODE_ENV = 'production';
    const res = await transfer(alice, { amount: 1000, paymentMethod: 'pix' });
    expect(res.status).toBe(501);
    expect(alice.balance).toBe(10000);
  });

  test('em desenvolvimento, Orange Money é simulado e liquidado na hora (sem setTimeout)', async () => {
    const res = await transfer(alice, { amount: 1000, paymentMethod: 'orange_money' });
    expect(res.status).toBe(201);
    expect(db.transactions[0].status).toBe('completed');
    expect(db.transactions[0].paymentDetails.simulated).toBe(true);
    expect(alice.balance).toBe(10000 - 1012);
  });
});

describe('outros endpoints', () => {
  test('usuário comum não estorna mais a própria transferência', async () => {
    await transfer(alice, { amount: 1000 });
    const res = await request(app).post(`/api/transactions/${db.transactions[0]._id}/reverse`)
      .set(auth(alice)).send({ reason: 'quero meu dinheiro de volta' });
    expect(res.status).toBe(404);
    expect(bob.balance).toBe(1000);
  });

  test('cotação devolve a mesma taxa que será cobrada', async () => {
    const res = await request(app).get('/api/transactions/quote')
      .query({ amount: 10000, currency: 'XOF', paymentMethod: 'mobile_money' }).set(auth(alice));
    expect(res.status).toBe(200);
    expect(res.body.quote).toMatchObject({ amountXOF: 10000, fee: 150, total: 10150 });
  });

  test('filtros com operador do Mongo (?status[$ne]=) são descartados', async () => {
    const find = jest.spyOn(Transaction, 'find').mockReturnValue({
      select() { return this; }, populate() { return this; }, sort() { return this; },
      skip() { return this; }, limit() { return Promise.resolve([]); },
    });
    jest.spyOn(Transaction, 'countDocuments').mockResolvedValue(0);
    const res = await request(app).get('/api/transactions?status[$ne]=x&limit=999999').set(auth(alice));
    expect(res.status).toBe(200);
    expect(find.mock.calls[0][0].status).toBeUndefined();
    expect(res.body.pagination.pages).toBe(0);
  });
});
