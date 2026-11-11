const { signToken, verifyToken, generateAuthTokens, hashToken, safeEqualHex } = require('../src/utils/tokens');

describe('tokens tipados', () => {
  const user = { _id: 'abc123', role: 'user' };

  test('access token só é aceito como access', () => {
    const { accessToken, refreshToken } = generateAuthTokens(user);
    expect(verifyToken(accessToken, 'access').id).toBe('abc123');
    expect(() => verifyToken(refreshToken, 'access')).toThrow();
    expect(() => verifyToken(accessToken, 'refresh')).toThrow();
  });

  test('token de MFA não vale como access', () => {
    const mfa = signToken('mfa_pending', { id: 'abc123' });
    expect(() => verifyToken(mfa, 'access')).toThrow();
    expect(verifyToken(mfa, 'mfa_pending').id).toBe('abc123');
  });

  test('access token expira em 15 minutos por padrão', () => {
    const decoded = verifyToken(signToken('access', { id: 'x' }), 'access');
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  test('hashToken + safeEqualHex', () => {
    expect(safeEqualHex(hashToken('a'), hashToken('a'))).toBe(true);
    expect(safeEqualHex(hashToken('a'), hashToken('b'))).toBe(false);
    expect(safeEqualHex(undefined, hashToken('a'))).toBe(false);
  });
});
