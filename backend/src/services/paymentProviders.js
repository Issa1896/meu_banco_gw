const { MoneyError } = require('../utils/money');

const LABELS = {
  wallet: 'Carteira MeuBanco',
  bank_transfer: 'Transferência bancária',
  orange_money: 'Orange Money',
  mobile_money: 'Mobile Money',
  pix: 'PIX',
  iban: 'IBAN/SWIFT',
};

/**
 * Simulação de provedores externos: só fora de produção (desligável com
 * PAYMENT_SIMULATION=false). Em produção, métodos sem integração real
 * respondem 501 — antes eles ficavam "processing" para sempre (PIX/IBAN)
 * ou eram liquidados por um setTimeout que se perdia ao reiniciar.
 */
const simulationEnabled = () => process.env.NODE_ENV !== 'production'
  && process.env.PAYMENT_SIMULATION !== 'false';

/** Define como uma transferência é liquidada para o método escolhido. */
const resolveSettlement = (paymentMethod) => {
  if (!LABELS[paymentMethod]) throw new MoneyError('Método de pagamento inválido');
  if (paymentMethod === 'wallet') return { provider: 'wallet', simulated: false };
  if (simulationEnabled()) return { provider: paymentMethod, simulated: true };
  throw new MoneyError(`${LABELS[paymentMethod]} ainda não está disponível`, 501);
};

module.exports = { resolveSettlement, simulationEnabled, PAYMENT_LABELS: LABELS };
