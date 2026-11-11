const request = require('supertest');
const { app } = require('../src/app');
const { makeUser, mockUserStore } = require('./helpers');

beforeEach(async () => mockUserStore([await makeUser()]));

test('login: a 6ª tentativa em 15 min é bloqueada (429)', async () => {
  const statuses = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'fatumata@exemplo.gw', password: 'errada' });
    statuses.push(res.status);
  }
  expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
  expect(statuses[5]).toBe(429);
});

test('verify-2fa tem rate limit próprio (antes não tinha nenhum)', async () => {
  let last;
  for (let i = 0; i < 11; i += 1) {
    last = await request(app).post('/api/auth/verify-2fa').send({ mfaToken: 'x', token: '000000' });
  }
  expect(last.status).toBe(429);
});
