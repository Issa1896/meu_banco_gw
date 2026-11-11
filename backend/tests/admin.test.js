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
const REASON = 'Fraude confirmada pelo atendimento';

beforeEach(async () => {
  n += 1;
  const mk = (p, extra) => makeUser({ email: `${p}${n}@ex.gw`, phone: `+2459${p.length}${String(n).padStart(6, '0')}${p.length}`, accountNumber: `GW${p}${n}`, ...extra });
  alice = await mk('alice', { balance: 10000 });
  bob = await mk('bob', { balance: 0 });
  admin = await mk('adm', { role: 'admin' });
  superadmin = await mk('superadm', { role: 'superadmin' });
  db = createFakeDb({ users: [alice, bob, admin, superadmin] });

  const res = await request(app).post('/api/transactions/transfer').set(auth(alice))
    .send({ recipientAccount: bob.accountNumber, amount: 1000, currency: 'XOF', paymentMethod: 'wallet' });
  expect(res.status).toBe(201);
});

const reverse = (who, body = { reason: REASON }) => request(app)
  .post(`/api/admin/transactions/${db.transactions[0]._id}/reverse`).set(auth(who)).send(body);

describe('estorno pelo admin', () => {
  test('devolve o valor ao remetente, debita o destinatário e cria transação "refund"', async () => {
    const res = await reverse(admin);
    expect(res.status).toBe(200);
    expect(bob.balance).toBe(0);
    expect(alice.balance).toBe(10000 - 1010 + 1000); // taxa não é devolvida
    expect(db.transactions[0].status).toBe('reversed');
    expect(db.transactions[1]).toMatchObject({ type: 'refund', amount: 1000, status: 'completed' });
    expect(String(db.transactions[1].relatedTransaction)).toBe(String(db.transactions[0]._id));
  });

  test('não estorna duas vezes', async () => {
    await reverse(admin);
    const again = await reverse(admin);
    expect(again.status).toBe(409);
    expect(alice.balance).toBe(9990);
  });

  test('dois estornos simultâneos: só um é aplicado', async () => {
    const results = await Promise.all([reverse(admin), reverse(admin)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(alice.balance).toBe(9990);
    expect(bob.balance).toBe(0);
  });

  test('destinatário já gastou: 409 e NADA muda (a original continua "completed")', async () => {
    bob.balance = 400;
    const res = await reverse(admin);
    expect(res.status).toBe(409);
    expect(db.transactions[0].status).toBe('completed');
    expect(alice.balance).toBe(8990);
    expect(bob.balance).toBe(400);
    expect(db.transactions).toHaveLength(1);
  });

  test('exige motivo', async () => {
    const res = await reverse(admin, { reason: 'ok' });
    expect(res.status).toBe(400);
  });

  test('usuário comum não acessa', async () => {
    const res = await reverse(alice);
    expect(res.status).toBe(403);
  });
});

describe('alteração de status de usuário', () => {
  const setStatus = (who, target, status) => request(app)
    .put(`/api/admin/users/${target._id}/status`).set(auth(who)).send({ status, reason: 'teste' });

  beforeEach(() => {
    const Notification = require('../src/models/Notification');
    jest.spyOn(Notification, 'create').mockResolvedValue({});
  });

  test('status inválido é recusado', async () => {
    const res = await setStatus(admin, alice, 'hacker');
    expect(res.status).toBe(400);
  });

  test('admin bloqueia usuário comum', async () => {
    const res = await setStatus(admin, alice, 'blocked');
    expect(res.status).toBe(200);
    expect(alice.status).toBe('blocked');
  });

  test('admin NÃO bloqueia superadmin nem outro admin', async () => {
    expect((await setStatus(admin, superadmin, 'blocked')).status).toBe(403);
    expect(superadmin.status).toBe('active');
  });

  test('ninguém altera o próprio status', async () => {
    expect((await setStatus(superadmin, superadmin, 'blocked')).status).toBe(403);
  });
});
