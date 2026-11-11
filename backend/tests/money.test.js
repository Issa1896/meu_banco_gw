const { parseAmount, calculateFeeXOF, quote, EUR_XOF_PEG } = require('../src/utils/money');

describe('valores e câmbio', () => {
  afterEach(() => { delete process.env.FX_USD_XOF; });

  test('XOF: inteiro, aceita string numérica (sem concatenação)', () => {
    const q = quote('1000', 'XOF', 'wallet');
    expect(q.amountXOF).toBe(1000);
    expect(q.feeXOF).toBe(10);
    expect(q.totalXOF).toBe(1010); // antes: "1000" + 10 = "100010"
  });

  test('XOF com centavos é recusado', () => {
    expect(() => parseAmount(100.5, 'XOF')).toThrow('inteiros');
  });

  test('EUR converte pela paridade fixa e arredonda para XOF inteiro', () => {
    const p = parseAmount(10, 'EUR');
    expect(p.exchangeRate).toBe(EUR_XOF_PEG);
    expect(p.amountXOF).toBe(6560); // 6559,57
  });

  test('EUR aceita 2 casas, recusa 3', () => {
    expect(parseAmount(10.1, 'EUR').amountXOF).toBe(Math.round(10.1 * EUR_XOF_PEG));
    expect(() => parseAmount(10.123, 'EUR')).toThrow('2 casas');
  });

  test('USD sem cotação configurada é indisponível (nunca 1:1)', () => {
    expect(() => parseAmount(10, 'USD')).toThrow('indisponível');
    process.env.FX_USD_XOF = '600';
    expect(parseAmount(10, 'USD').amountXOF).toBe(6000);
  });

  test('mínimo, máximo e valores inválidos', () => {
    expect(() => parseAmount(49, 'XOF')).toThrow('mínimo');
    expect(() => parseAmount(10_000_000, 'XOF')).toThrow('máximo');
    ['abc', -100, 0, NaN, Infinity, null, {}].forEach((v) => expect(() => parseAmount(v, 'XOF')).toThrow());
  });
});

describe('taxas', () => {
  test('cada método tem sua taxa, arredondada para cima', () => {
    expect(calculateFeeXOF(1000, 'wallet')).toBe(10);
    expect(calculateFeeXOF(1000, 'orange_money')).toBe(12);
    expect(calculateFeeXOF(1000, 'mobile_money')).toBe(15);
    expect(calculateFeeXOF(1001, 'wallet')).toBe(11); // 10,01 → 11
  });

  test('PIX/IBAN cobram 2,5% (antes: 0,01 fixo)', () => {
    expect(calculateFeeXOF(10000, 'pix')).toBe(250);
    expect(calculateFeeXOF(10000, 'iban')).toBe(250);
  });

  test('método desconhecido é erro', () => {
    expect(() => calculateFeeXOF(1000, 'bitcoin')).toThrow();
  });
});
