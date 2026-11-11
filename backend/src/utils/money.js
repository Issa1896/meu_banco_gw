/**
 * Regras de dinheiro do MeuBanco GW.
 *
 * - Todas as carteiras são em XOF (franco CFA da UEMOA), que não tem
 *   subdivisão: saldos, valores e taxas são INTEIROS em XOF.
 * - Valores em outra moeda são convertidos no servidor, e a taxa usada
 *   fica gravada na transação.
 */

const SETTLEMENT_CURRENCY = 'XOF';
const SUPPORTED_CURRENCIES = ['XOF', 'EUR', 'USD', 'BRL'];
const MIN_TRANSFER_XOF = 50;
const MAX_TRANSFER_XOF = Number(process.env.MAX_TRANSFER_XOF) || 5_000_000;

// Paridade fixa EUR/XOF garantida pelo Tesouro francês desde 1999.
const EUR_XOF_PEG = 655.957;

class MoneyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'MoneyError';
    this.statusCode = statusCode;
  }
}

/** Quantos XOF vale 1 unidade da moeda. USD e BRL vêm do ambiente. */
const getRateToXOF = (currency) => {
  if (currency === 'XOF') return 1;
  if (currency === 'EUR') return EUR_XOF_PEG;
  const fromEnv = Number(process.env[`FX_${currency}_XOF`]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  // Sem cotação configurada a moeda fica indisponível — nunca 1:1 por engano.
  throw new MoneyError(`Câmbio ${currency}/XOF indisponível no momento`, 422);
};

/** Converte e valida o valor digitado pelo usuário. */
const parseAmount = (rawAmount, currency = 'XOF') => {
  if (!SUPPORTED_CURRENCIES.includes(currency)) throw new MoneyError('Moeda não suportada');

  const amount = typeof rawAmount === 'string' ? Number(rawAmount.replace(',', '.')) : rawAmount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new MoneyError('Valor inválido');
  }

  const maxDecimals = currency === 'XOF' ? 0 : 2;
  const scaled = amount * 10 ** maxDecimals;
  // tolerância para ruído de ponto flutuante (ex.: 10.1 * 100 = 1009.9999999999999)
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new MoneyError(currency === 'XOF'
      ? 'Valores em XOF devem ser inteiros'
      : `Valores em ${currency} aceitam no máximo 2 casas decimais`);
  }

  const rate = getRateToXOF(currency);
  const amountXOF = Math.round(amount * rate);

  if (amountXOF < MIN_TRANSFER_XOF) throw new MoneyError(`Valor mínimo é ${MIN_TRANSFER_XOF} XOF`);
  if (amountXOF > MAX_TRANSFER_XOF) throw new MoneyError(`Valor máximo por transferência é ${MAX_TRANSFER_XOF} XOF`);

  return { originalAmount: amount, originalCurrency: currency, exchangeRate: rate, amountXOF };
};

// Taxas por método (percentual sobre o valor em XOF)
const FEE_RATES = {
  wallet: 0.01,
  bank_transfer: 0.01,
  orange_money: 0.012,
  mobile_money: 0.015,
  pix: 0.025,
  iban: 0.025,
};

/** Taxa inteira em XOF, arredondada para cima. */
const calculateFeeXOF = (amountXOF, paymentMethod) => {
  const rate = FEE_RATES[paymentMethod];
  if (rate === undefined) throw new MoneyError('Método de pagamento inválido');
  if (!Number.isInteger(amountXOF) || amountXOF <= 0) throw new MoneyError('Valor inválido');
  return Math.ceil(amountXOF * rate);
};

const quote = (rawAmount, currency, paymentMethod) => {
  const parsed = parseAmount(rawAmount, currency);
  const feeXOF = calculateFeeXOF(parsed.amountXOF, paymentMethod);
  return {
    ...parsed,
    feeXOF,
    feeRate: FEE_RATES[paymentMethod],
    totalXOF: parsed.amountXOF + feeXOF,
    settlementCurrency: SETTLEMENT_CURRENCY,
  };
};

const isIntegerXOF = { validator: Number.isInteger, message: '{PATH} deve ser um inteiro em XOF' };

module.exports = {
  SETTLEMENT_CURRENCY,
  SUPPORTED_CURRENCIES,
  MIN_TRANSFER_XOF,
  MAX_TRANSFER_XOF,
  EUR_XOF_PEG,
  FEE_RATES,
  MoneyError,
  getRateToXOF,
  parseAmount,
  calculateFeeXOF,
  quote,
  isIntegerXOF,
};
