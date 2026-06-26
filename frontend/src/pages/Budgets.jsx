import { useState, useEffect } from 'react';
import { budgetAPI } from '../services/api';
import toast from 'react-hot-toast';

const categoryLabels = {
  alimentacao: '🍽️ Alimentação', transporte: '🚗 Transporte', moradia: '🏠 Moradia',
  saude: '🏥 Saúde', educacao: '📚 Educação', lazer: '🎮 Lazer',
  servicos: '🔧 Serviços', compras: '🛒 Compras', transferencia: '💸 Transferência',
  investimento: '📈 Investimento', outros: '📦 Outros',
};

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: 'alimentacao', limit: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });

  useEffect(() => { loadBudgets(); }, []);

  const loadBudgets = async () => {
    try {
      const [budgetsData, summaryData] = await Promise.all([
        budgetAPI.list(),
        budgetAPI.getSummary(),
      ]);
      setBudgets(budgetsData.data.budgets);
      setSummary(summaryData.data.summary);
    } catch (error) {
      toast.error('Erro ao carregar orçamentos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await budgetAPI.create(form);
      toast.success('Orçamento criado');
      setShowForm(false);
      setForm({ category: 'alimentacao', limit: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
      loadBudgets();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao criar');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover este orçamento?')) return;
    try {
      await budgetAPI.delete(id);
      toast.success('Orçamento removido');
      loadBudgets();
    } catch (error) {
      toast.error('Erro ao remover');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orçamentos</h1>
          <p className="text-gray-500">Controle seus gastos mensais</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancelar' : 'Novo Orçamento'}
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="card bg-gradient-to-r from-accent-500 to-accent-700 text-white border-0">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-accent-100 text-sm">Orçamento Total</p>
              <p className="text-2xl font-bold">{summary.totalBudget?.toLocaleString()} XOF</p>
            </div>
            <div>
              <p className="text-accent-100 text-sm">Gasto</p>
              <p className="text-2xl font-bold">{summary.totalSpent?.toLocaleString()} XOF</p>
            </div>
            <div>
              <p className="text-accent-100 text-sm">Restante</p>
              <p className="text-2xl font-bold">{summary.remaining?.toLocaleString()} XOF</p>
            </div>
          </div>
          <div className="mt-4 w-full bg-white/20 rounded-full h-3">
            <div className="bg-white h-3 rounded-full" style={{ width: `${Math.min(summary.percentage || 0, 100)}%` }} />
          </div>
        </div>
      )}

      {/* New Budget Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4 animate-fade-in">
          <h3 className="font-bold">Novo Orçamento</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Categoria</label>
              <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Limite (XOF)</label>
              <input type="number" className="input-field" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} required min="1" />
            </div>
          </div>
          <button type="submit" className="btn-primary">Criar Orçamento</button>
        </form>
      )}

      {/* Budget List */}
      <div className="grid gap-4">
        {budgets.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">📋</div>
            <p>Nenhum orçamento configurado</p>
          </div>
        ) : (
          budgets.map((b) => (
            <div key={b._id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold">{categoryLabels[b.category] || b.category}</h3>
                  <p className="text-sm text-gray-500">{b.month}/{b.year}</p>
                </div>
                <button onClick={() => handleDelete(b._id)} className="text-red-500 hover:text-red-700 text-sm">Excluir</button>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span>{b.spent?.toLocaleString()} XOF gastos</span>
                <span className="font-bold">{b.limit?.toLocaleString()} XOF limite</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${b.percentage > 90 ? 'bg-red-500' : b.percentage > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(b.percentage || 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{b.percentage}% utilizado</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
