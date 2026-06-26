const { body, param, query } = require('express-validator');

const registerValidator = [
  body('name').trim().notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('phone').matches(/^(\+245)?[0-9]{7,9}$/).withMessage('Telefone inválido para Guiné-Bissau'),
  body('password').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres')
    .matches(/[A-Z]/).withMessage('Senha deve conter uma letra maiúscula')
    .matches(/[a-z]/).withMessage('Senha deve conter uma letra minúscula')
    .matches(/[0-9]/).withMessage('Senha deve conter um número'),
  body('documentId').optional().trim().notEmpty(),
];

const transferValidator = [
  body('recipientAccount').trim().notEmpty().withMessage('Conta do destinatário é obrigatória'),
  body('amount').isFloat({ min: 50 }).withMessage('Valor mínimo é 50 XOF'),
  body('currency').isIn(['XOF', 'EUR', 'USD', 'BRL']).withMessage('Moeda não suportada'),
  body('description').optional().trim().isLength({ max: 200 }),
  body('paymentMethod').isIn(['orange_money', 'mobile_money', 'bank_transfer', 'pix', 'iban'])
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

module.exports = {
  registerValidator,
  transferValidator,
  pixValidator,
  ibanValidator,
};
