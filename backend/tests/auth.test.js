const request = require('supertest');
const speakeasy = require('speakeasy');
const { app } = require('../src/app');
const { encrypt } = require('../src/utils/encryption');
const { signToken, generateAuthTokens, hashToken } = require('../src/utils/tokens');
const { makeUser, mockUserStore } = require('./helpers');

const totpSecret = speakeasy.generateSecret().base32;
const currentCode = () => speakeasy.totp({ secret: totpSecret, encoding: 'base32' });
const wrongCode = () => String((Number(currentCode()) + 500000) % 1000000).padStart(6, '0');

let user;
let user2fa;

beforeEach(async () => {
  user = await makeUser();
  user2fa = await makeUser({
    email: 'braima@exemplo.gw',
    phone: '+245955333444',
    twoFactorEnabled: true,
    twoFactorSecret: encrypt(totpSecret),
  });
  mockUserStore([user, user2fa]);
});

describe('1.3 — tipos de token', () => {
  test('access token acessa o perfil', async () => {
    const { accessToken } = generateAuthTokens(user);
    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  test('refresh token NÃO funciona como access token', async () => {
    const { refreshToken } = generateAuthTokens(user);
    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${refreshToken}`);
    expect(res.status).toBe(401);
  });

  test('token de MFA NÃO funciona como access token', async () => {
    const mfa = signToken('mfa_pending', { id: user._id.toString() });
    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${mfa}`);
    expect(res.status).toBe(401);
  });

  test('perfil não expõe hashes nem segredos', async () => {
    user.refreshTokenHash = hashToken('x');
    const { accessToken } = generateAuthTokens(user);
    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${accessToken}`);
    ['password', 'twoFactorSecret', 'refreshTokenHash', 'passwordResetToken', 'loginAttempts']
      .forEach((f) => expect(res.body.user).not.toHaveProperty(f));
  });
});

describe('1.3 — refresh token com rotação', () => {
  test('rotaciona e detecta reuso do token antigo', async () => {
    const { refreshToken } = generateAuthTokens(user);
    user.refreshTokenHash = hashToken(refreshToken);

    const first = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    // Reapresentar o refresh antigo = possível roubo → 401 e sessão encerrada
    const reuse = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(reuse.status).toBe(401);
    expect(user.refreshTokenHash).toBeUndefined();
  });
});

describe('1.4 — login com 2FA', () => {
  test('senha correta devolve só mfaToken (nenhum token de acesso, nenhum userId)', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: user2fa.email, password: 'Senha123!' });
    expect(res.status).toBe(200);
    expect(res.body.requires2FA).toBe(true);
    expect(res.body.mfaToken).toBeDefined();
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.userId).toBeUndefined();
  });

  test('o fluxo antigo (só userId + código) é rejeitado', async () => {
    const res = await request(app).post('/api/auth/verify-2fa')
      .send({ userId: user2fa._id.toString(), token: currentCode() });
    expect(res.status).toBe(400);
  });

  test('mfaToken + código errado → 401; + código certo → tokens', async () => {
    const mfaToken = signToken('mfa_pending', { id: user2fa._id.toString() });

    const bad = await request(app).post('/api/auth/verify-2fa').send({ mfaToken, token: wrongCode() });
    expect(bad.status).toBe(401);
    expect(user2fa.twoFactorFailedAttempts).toBe(1);

    const ok = await request(app).post('/api/auth/verify-2fa').send({ mfaToken, token: currentCode() });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeDefined();
    expect(ok.body.refreshToken).toBeDefined();
    expect(user2fa.twoFactorFailedAttempts).toBe(0);
  });

  test('5 códigos errados bloqueiam o 2FA temporariamente', async () => {
    const mfaToken = signToken('mfa_pending', { id: user2fa._id.toString() });
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/auth/verify-2fa').send({ mfaToken, token: wrongCode() });
    }
    const res = await request(app).post('/api/auth/verify-2fa').send({ mfaToken, token: currentCode() });
    expect(res.status).toBe(423);
  });
});

describe('1.4 — ativar e desativar 2FA', () => {
  test('enable usa o segredo do servidor, não o enviado pelo cliente', async () => {
    const { accessToken } = generateAuthTokens(user);
    const setup = await request(app).get('/api/auth/2fa/setup').set('Authorization', `Bearer ${accessToken}`);
    expect(setup.status).toBe(200);
    expect(user.twoFactorPendingSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // cifrado

    // Cliente tenta impor um segredo próprio: ignorado
    const attackerSecret = speakeasy.generateSecret().base32;
    const forged = await request(app).post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ secret: attackerSecret, token: speakeasy.totp({ secret: attackerSecret, encoding: 'base32' }) });
    expect(forged.status).toBe(400);

    const code = speakeasy.totp({ secret: setup.body.secret, encoding: 'base32' });
    const ok = await request(app).post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${accessToken}`).send({ token: code });
    expect(ok.status).toBe(200);
    expect(user.twoFactorEnabled).toBe(true);
    expect(user.twoFactorSecret).not.toBe(setup.body.secret); // guardado cifrado
  });

  test('desativar exige senha + código', async () => {
    const { accessToken } = generateAuthTokens(user2fa);
    const auth = { Authorization: `Bearer ${accessToken}` };

    const noBody = await request(app).post('/api/auth/2fa/disable').set(auth).send({});
    expect(noBody.status).toBe(401);

    const wrongPass = await request(app).post('/api/auth/2fa/disable').set(auth)
      .send({ password: 'Errada123!', token: currentCode() });
    expect(wrongPass.status).toBe(401);
    expect(user2fa.twoFactorEnabled).toBe(true);

    const ok = await request(app).post('/api/auth/2fa/disable').set(auth)
      .send({ password: 'Senha123!', token: currentCode() });
    expect(ok.status).toBe(200);
    expect(user2fa.twoFactorEnabled).toBe(false);
  });
});

describe('1.2 — esqueci a senha', () => {
  test('email inexistente e existente recebem a mesma resposta, sem token', async () => {
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ninguem@exemplo.gw' });
    const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.resetToken).toBeUndefined();
    expect(user.passwordResetToken).toMatch(/^[a-f0-9]{64}$/); // só o hash
  });

  test('reset com token válido troca a senha e encerra sessões', async () => {
    const token = 'a'.repeat(64);
    user.passwordResetToken = hashToken(token);
    user.passwordResetExpires = new Date(Date.now() + 60000);
    user.refreshTokenHash = hashToken('sessao-antiga');

    const weak = await request(app).post('/api/auth/reset-password').send({ token, password: '123' });
    expect(weak.status).toBe(400);

    const ok = await request(app).post('/api/auth/reset-password').send({ token, password: 'NovaSenha9' });
    expect(ok.status).toBe(200);
    expect(user.passwordResetToken).toBeUndefined();
    expect(user.refreshTokenHash).toBeUndefined();
    expect(user.password).toBe('NovaSenha9'); // o hook de save (não simulado) faz o hash

    const again = await request(app).post('/api/auth/reset-password').send({ token, password: 'OutraSenha9' });
    expect(again.status).toBe(400);
  });
});

describe('1.1 — biometria', () => {
  test('login biométrico desativado (não emite tokens)', async () => {
    const res = await request(app).post('/api/auth/biometric/login')
      .send({ email: user.email, biometricSignature: 'qualquer' });
    expect(res.status).toBe(501);
    expect(res.body.accessToken).toBeUndefined();
  });
});

describe('2.1 — CORS', () => {
  test('origem desconhecida não recebe Access-Control-Allow-Origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://site-malicioso.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('origem configurada é permitida', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
