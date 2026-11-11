const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const receiptController = require('../controllers/receiptController');
const ledgerController = require('../controllers/ledgerController');
const { authenticate } = require('../middleware/auth');
const { transferValidator } = require('../utils/validators');
const { transferLimiter } = require('../middleware/security');

router.use(authenticate);

router.post('/transfer', transferLimiter, transferValidator, transactionController.createTransfer);
router.get('/quote', transactionController.getQuote);
router.get('/statement', ledgerController.myStatement);
router.get('/', transactionController.getTransactions);
router.get('/stats', transactionController.getStats);
router.get('/balance', transactionController.getBalance);
router.get('/monthly-report', transactionController.getMonthlyReport);
router.get('/:id', transactionController.getTransactionById);
// Estorno: somente admin (POST /api/admin/transactions/:id/reverse)
router.get('/:id/receipt', receiptController.generateReceipt);

module.exports = router;
