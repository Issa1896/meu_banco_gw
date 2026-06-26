import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { transactionAPI, budgetAPI } from '../services/api';

export default function Dashboard() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [stats, setStats] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [budgetSummary, setBudgetSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [balanceData, statsData, transactionsData, budgetData] = await Promise.all([
        transactionAPI.getBalance(),
        transactionAPI.getStats(),
        transactionAPI.list({ limit: 5 }),
        budgetAPI.getSummary(),
      ]);
      setBalance(balanceData.data.balance);
      setStats(statsData.data.stats);
      setRecentTransactions(transactionsData.data.transactions);
      setBudgetSummary(budgetData.data.summary);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Olá, {user?.name?.split(' ')[0] || 'Usuário'}!</h1>
        <p className="text-gray-500 dark:text-gray-400">Bem-vindo ao MeuBanco GW</p>
      </div>

      {/* Saldo */}
      <div className="card bg-gradient-to-r from-primary-600 to-primary-800 text-white border-0">
        <div className="flex items-center justify-between mb-4">
          <p className="text-primary-100">Saldo Disponível</p>
          <span className="badge bg-white/20 text-white">XOF</span>
        </div>
        <h2 className="text-4xl font-bold mb-1">
          {balance?.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) || '0'}
        </h2>
        <p className="text-primary-200 text-sm">Francos CFA (XOF)</p>
        <div className="mt-6 flex gap-3">
          <Link to="/transactions/new" className="flex-1 bg-white/20 hover:bg-white/30 text-white text-center py-3 rounded-lg font-medium transition-colors">
            💸 Enviar
          </Link>
          <Link to="/transactions" className="flex-1 bg-white/20 hover:bg-white/30 text-white text-center py-3 rounded-lg font-medium transition-colors">
            📥 Receber
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Enviado (30d)</p>
          <p className="text-xl font-bold text-red-600">{stats?.totalSent?.toLocaleString() || '0'} XOF</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Recebido (30d)</p>
          <p className="text-xl font-bold text-green-600">{stats?.totalReceived?.toLocaleString() || '0'} XOF</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Transações</p>
          <p className="text-xl font-bold">{stats?.totalTransactions || 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Taxas Pagas</p>
          <p className="text-xl font-bold">{stats?.totalFees?.toLocaleString() || '0'} XOF</p>
        </div>
      </div>

      {/* Orçamento e Transações Recentes */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Orçamento */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">Orçamento Mensal</h3>
            <Link to="/budgets" className="text-sm text-primary-600 hover:underline">Ver todos</Link>
          </div>
          {budgetSummary ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Gasto</span>
                <span className="font-bold">{budgetSummary.totalSpent?.toLocaleString() || '0'} / {budgetSummary.totalBudget?.toLocaleString() || '0'} XOF</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className="bg-primary-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(budgetSummary.percentage || 0, 100)}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">
                Restante: {((budgetSummary.totalBudget || 0) - (budgetSummary.totalSpent || 0)).toLocaleString()} XOF
              </p>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Nenhum orçamento configurado</p>
          )}
        </div>

        {/* Transações Recentes */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">Transações Recentes</h3>
            <Link to="/transactions" className="text-sm text-primary-600 hover:underline">Ver todas</Link>
          </div>
          {recentTransactions.length > 0 ? (
            <div className="space-y-3">
              {recentTransactions.map((t) => (
                <div key={t._id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${t.sender === user?._id ? 'bg-red-100' : 'bg-green-100'}`}>
                      {t.sender === user?._id ? '💸' : '💰'}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.recipientName || 'Transferência'}</p>
                      <p className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${t.sender === user?._id ? 'text-red-600' : 'text-green-600'}`}>
                      {t.sender === user?._id ? '-' : '+'}{t.amount?.toLocaleString()} XOF
                    </p>
                    <span className={`badge ${t.status === 'completed' ? 'badge-success' : t.status === 'pending' ? 'badge-warning' : 'badge-error'} text-xs`}>
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-3">📭</div>
              <p>Nenhuma transação recente</p>
              <Link to="/transactions/new" className="btn-primary inline-block mt-4 text-sm">Fazer transferência</Link>
            </div>
          )}
        </div>
      </div>

      {/* Métodos de Pagamento */}
      <div className="card">
        <h3 className="font-bold mb-4">Métodos de Pagamento</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'Orange Money', icon: '🟠', desc: 'Transferência via Orange Money' },
            { name: 'Mobile Money', icon: '📱', desc: 'Pagamento Mobile Money' },
            { name: 'PIX', icon: '⚡', desc: 'PIX Internacional' },
            { name: 'IBAN', icon: '🏦', desc: 'Transferência IBAN' },
          ].map((method) => (
            <div key={method.name} className="card-hover text-center">
              <div className="text-3xl mb-2">{method.icon}</div>
              <h4 className="font-medium text-sm">{method.name}</h4>
              <p className="text-xs text-gray-500 mt-1">{method.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
