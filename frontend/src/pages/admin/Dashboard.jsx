import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const { data } = await adminAPI.getDashboard();
      setStats(data.stats);
      setRecentLogs(data.recentLogs);
    } catch (error) {
      console.error('Erro ao carregar dashboard admin:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in text-white">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard Administrativo</h1>
        <p className="text-gray-400">Visão geral do sistema</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Usuários', value: stats?.totalUsers || 0, color: 'from-blue-600 to-blue-800', icon: '👥' },
          { label: 'Usuários Ativos', value: stats?.activeUsers || 0, color: 'from-green-600 to-green-800', icon: '✅' },
          { label: 'KYC Pendentes', value: stats?.pendingKYC || 0, color: 'from-yellow-600 to-yellow-800', icon: '📋' },
          { label: 'Transações', value: stats?.totalTransactions || 0, color: 'from-purple-600 to-purple-800', icon: '💳' },
          { label: 'Transações Mês', value: stats?.monthlyTransactions || 0, color: 'from-pink-600 to-pink-800', icon: '📈' },
          { label: 'Volume (XOF)', value: (stats?.totalVolume || 0).toLocaleString(), color: 'from-indigo-600 to-indigo-800', icon: '💰' },
          { label: 'Tickets Abertos', value: stats?.pendingTickets || 0, color: 'from-red-600 to-red-800', icon: '🎫' },
          { label: 'Transações Hoje', value: stats?.transactionsToday || 0, color: 'from-teal-600 to-teal-800', icon: '⚡' },
        ].map((card) => (
          <div key={card.label} className={`bg-gradient-to-br ${card.color} rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className="text-3xl font-bold">{card.value}</p>
            <p className="text-sm text-white/70 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Logs Recentes */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Atividades Recentes</h2>
        <div className="space-y-2">
          {recentLogs.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhuma atividade recente</p>
          ) : (
            recentLogs.map((log) => (
              <div key={log._id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <div>
                  <p className="text-sm"><span className="font-medium">{log.user?.name || 'Sistema'}</span> - {log.action}</p>
                  <p className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <span className={`badge text-xs ${log.severity === 'critical' ? 'badge-error' : log.severity === 'warning' ? 'badge-warning' : 'badge-info'}`}>
                  {log.severity}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
