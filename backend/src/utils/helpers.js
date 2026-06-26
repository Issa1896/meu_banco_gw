const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const generateTransactionRef = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TRX-${timestamp}-${random}`;
};

const generateAccountNumber = () => {
  const prefix = 'GW'; // Guiné-Bissau
  const random = Math.floor(100000000 + Math.random() * 900000000);
  return `${prefix}${random}`;
};

const generateQRCodeData = (accountNumber, amount, currency) => {
  return JSON.stringify({
    account: accountNumber,
    amount,
    currency,
    timestamp: Date.now(),
    id: uuidv4(),
  });
};

const formatCurrency = (amount, currency = 'XOF') => {
  return new Intl.NumberFormat('pt-GW', {
    style: 'currency',
    currency,
  }).format(amount);
};

const calculateFee = (amount, type) => {
  const fees = {
    transfer: amount * 0.01, // 1%
    withdrawal: amount * 0.005, // 0.5%
    mobile_money: amount * 0.015, // 1.5%
    orange_money: amount * 0.012, // 1.2%
    international: amount * 0.025, // 2.5%
  };
  return Math.round((fees[type] || 0.01) * 100) / 100;
};

const maskSensitiveData = (data) => {
  if (!data) return '';
  const str = String(data);
  return str.length > 4
    ? `${'*'.repeat(str.length - 4)}${str.slice(-4)}`
    : str;
};

module.exports = {
  generateTransactionRef,
  generateAccountNumber,
  generateQRCodeData,
  formatCurrency,
  calculateFee,
  maskSensitiveData,
};
