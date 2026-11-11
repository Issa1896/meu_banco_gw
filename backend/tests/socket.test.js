const http = require('http');
const { io: connect } = require('socket.io-client');
const { setupSocket } = require('../src/config/socket');
const { generateAuthTokens } = require('../src/utils/tokens');
const { makeUser, mockUserStore } = require('./helpers');

let server;
let url;
let alice;
let bob;
let admin;
const clients = [];

const open = (token) => new Promise((resolve, reject) => {
  const c = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  clients.push(c);
  c.on('connect', () => resolve(c));
  c.on('connect_error', reject);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  server = http.createServer();
  setupSocket(server);
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});

beforeEach(async () => {
  alice = await makeUser();
  bob = await makeUser({ email: 'bob@exemplo.gw', phone: '+245955000999' });
  admin = await makeUser({ email: 'adm@exemplo.gw', phone: '+245955000998', role: 'superadmin' });
  mockUserStore([alice, bob, admin]);
});

afterEach(() => { clients.splice(0).forEach((c) => c.close()); });
afterAll(() => new Promise((r) => server.close(r)));

test('access token conecta; refresh token é recusado', async () => {
  await expect(open(generateAuthTokens(alice).accessToken)).resolves.toBeDefined();
  await expect(open(generateAuthTokens(alice).refreshToken)).rejects.toThrow('Token inválido');
});

test('conta bloqueada não conecta', async () => {
  bob.status = 'blocked';
  await expect(open(generateAuthTokens(bob).accessToken)).rejects.toThrow('Usuário não autorizado');
});

test('um cliente não consegue mandar "transaction:update" falso para outro usuário', async () => {
  const a = await open(generateAuthTokens(alice).accessToken);
  const b = await open(generateAuthTokens(bob).accessToken);
  const received = jest.fn();
  b.on('transaction:update', received);

  a.emit('transaction:status', { userId: bob._id.toString(), status: 'completed', amount: 999999 });
  await wait(150);
  expect(received).not.toHaveBeenCalled();
});

test('mensagem de suporte chega ao superadmin', async () => {
  const adm = await open(generateAuthTokens(admin).accessToken);
  const a = await open(generateAuthTokens(alice).accessToken);
  const got = new Promise((r) => adm.on('support:new', r));
  a.emit('support:message', { message: 'Kuma ku n na fasi transferénsia?' });
  await expect(got).resolves.toMatchObject({ message: 'Kuma ku n na fasi transferénsia?' });
});
