const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');

exports.createBudget = async (req, res) => {
  try {
    const { category, month, year, limit, alerts, rollover } = req.body;

    const existing = await Budget.findOne({
      user: req.user._id, category, month, year,
    });
    if (existing) {
      return res.status(409).json({ error: 'Orçamento já existe para esta categoria e período' });
    }

    const budget = await Budget.create({
      user: req.user._id, category, month, year, limit,
      alerts, rollover,
    });

    res.status(201).json({ budget });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar orçamento' });
  }
};

exports.getBudgets = async (req, res) => {
  try {
    const { month, year } = req.query;
    const query = { user: req.user._id };
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);

    const budgets = await Budget.find(query).sort({ category: 1 });

    // Calcular gastos atuais
    const now = new Date();
    const m = parseInt(month) || now.getMonth() + 1;
    const y = parseInt(year) || now.getFullYear();
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);

    const expenses = await Transaction.aggregate([
      {
        $match: {
          sender: req.user._id,
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const expenseMap = {};
    expenses.forEach(e => { expenseMap[e._id || 'outros'] = e.total; });

    const enriched = budgets.map(b => ({
      ...b.toObject(),
      spent: expenseMap[b.category] || 0,
      percentage: b.limit > 0 ? Math.round(((expenseMap[b.category] || 0) / b.limit) * 100) : 0,
    }));

    res.json({ budgets: enriched });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar orçamentos' });
  }
};

exports.updateBudget = async (req, res) => {
  try {
    const { limit, alerts, rollover } = req.body;
    const budget = await Budget.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { limit, alerts, rollover },
      { new: true, runValidators: true },
    );

    if (!budget) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    res.json({ budget });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar orçamento' });
  }
};

exports.deleteBudget = async (req, res) => {
  try {
    const budget = await Budget.findOneAndDelete({
      _id: req.params.id, user: req.user._id,
    });
    if (!budget) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }
    res.json({ message: 'Orçamento removido' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover orçamento' });
  }
};

exports.getBudgetSummary = async (req, res) => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const budgets = await Budget.find({ user: req.user._id, month, year });

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const totalBudget = budgets.reduce((acc, b) => acc + b.limit, 0);
    const totalSpent = budgets.reduce((acc, b) => acc + (b.spent || 0), 0);

    res.json({
      summary: {
        totalBudget,
        totalSpent,
        remaining: totalBudget - totalSpent,
        percentage: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
        budgetCount: budgets.length,
        categories: budgets.map(b => ({
          category: b.category,
          limit: b.limit,
          spent: b.spent || 0,
          percentage: b.limit > 0 ? Math.round(((b.spent || 0) / b.limit) * 100) : 0,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar resumo' });
  }
};
