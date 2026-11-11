const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const ledgerController = require('../controllers/ledgerController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('admin', 'superadmin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id/status', adminController.updateUserStatus);
router.put('/users/:id/kyc/approve', adminController.approveKYC);
router.put('/users/:id/kyc/reject', adminController.rejectKYC);
router.get('/tickets', adminController.listTickets);
router.post('/tickets/:id/reply', adminController.replyTicketAdmin);
router.get('/transactions', adminController.getTransactions);
router.post('/transactions/:id/reverse', adminController.reverseTransaction);
router.get('/ledger/trial-balance', ledgerController.trialBalance);
router.get('/ledger/reconciliation', ledgerController.reconciliation);
router.get('/ledger/accounts/:account/statement', ledgerController.accountStatement);
router.post('/ledger/adjustments', authorize('superadmin'), ledgerController.createAdjustment);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/analytics', adminController.getSystemAnalytics);

module.exports = router;
