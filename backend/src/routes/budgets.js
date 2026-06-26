const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/', budgetController.createBudget);
router.get('/', budgetController.getBudgets);
router.get('/summary', budgetController.getBudgetSummary);
router.put('/:id', budgetController.updateBudget);
router.delete('/:id', budgetController.deleteBudget);

module.exports = router;
