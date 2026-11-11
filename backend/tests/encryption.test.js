const { encrypt, decrypt } = require('../src/utils/encryption');

test('encrypt/decrypt ida e volta, IV aleatório', () => {
  const a = encrypt('JBSWY3DPEHPK3PXP');
  const b = encrypt('JBSWY3DPEHPK3PXP');
  expect(a).not.toBe(b);
  expect(decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
});

test('texto cifrado adulterado é rejeitado (GCM)', () => {
  const [iv, tag, data] = encrypt('segredo').split(':');
  const flipped = (data[0] === 'a' ? 'b' : 'a') + data.slice(1);
  expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow();
});
