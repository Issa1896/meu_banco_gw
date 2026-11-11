const { body, param, query } = require('express-validator');

const passwordRule = (field = 'password') => body(field)
  .isString().withMessage('Senha inválida')
  .isLength({ min: 8, max: 128 }).withMessage('Senha deve ter entre 8 e 128 caracteres')
  .matches(/[A-Z]/).withMessage('Senha deve conter uma letra maiúscula')
  .matches(/[a-z]/).withMessage('Senha deve conter uma letra minúscula')
  .matches(/[0-9]/).withMessage('Senha deve conter um número');

const registerValidator = [
  body('name').trim().notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('phone').matches(/^(\+245)?[0-9]{7,9}$/).withMessage('Telefone inválido para Guiné-Bissau'),
  passwordRule(),
  body('documentId').optional().trim().notEmpty(),
];

const TRANSFER_CATEGORIES = [
  'alimentacao', 'transporte', 'moradia', 'saude', 'educacao', 'lazer',
  'servicos', 'compras', 'transferencia', 'salario', 'investimento', 'outros',
];

// Valor, moeda, limites e taxa são validados em utils/money.js (no servidor)
const transferValidator = [
  body('recipientAccount').isString().trim().notEmpty().isLength({ max: 40 })
    .withMessage('Conta do destinatário é obrigatória'),
  body('amount').exists().withMessage('Valor é obrigatório')
    .custom((v) => typeof v === 'number' || typeof v === 'string').withMessage('Valor inválido'),
  body('currency').optional().isIn(['XOF', 'EUR', 'USD', 'BRL']).withMessage('Moeda não suportada'),
  body('description').optional().isString().trim().isLength({ max: 200 }),
  body('category').optional().isIn(TRANSFER_CATEGORIES).withMessage('Categoria inválida'),
  body('paymentMethod').isIn(['wallet', 'orange_money', 'mobile_money', 'bank_transfer', 'pix', 'iban'])
    .withMessage('Método de pagamento inválido'),
];

const pixValidator = [
  body('pixKey').trim().notEmpty().withMessage('Chave PIX é obrigatória'),
  body('amount').isFloat({ min: 1 }).withMessage('Valor inválido'),
  body('description').optional().trim(),
];

const ibanValidator = [
  body('iban').matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/).withMessage('IBAN inválido'),
  body('swift').optional().matches(/^[A-Z]{6}[A-Z0-9]{2,5}$/).withMessage('SWIFT inválido'),
  body('amount').isFloat({ min: 1 }),
  body('recipientName').trim().notEmpty().withMessage('Nome do destinatário obrigatório'),
];

const resetPasswordValidator = [
  body('token').isString().notEmpty().withMessage('Token é obrigatório'),
  passwordRule(),
];

module.exports = {
  registerValidator,
  resetPasswordValidator,
  transferValidator,
  pixValidator,
  ibanValidator,
};
