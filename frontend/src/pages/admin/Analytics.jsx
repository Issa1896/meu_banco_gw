import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAnalytics(); }, []);

  const loadAnalytics = async () => {
    try {
      const { data } = await adminAPI.getAnalytics();
      setAnalytics(data);
    } catch (error) {
      console.error('Erro ao carregar analytics:', error);
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
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-gray-400">Métricas e estatísticas do sistema</p>
      </div>

      {/* Performance Mensal */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Performance Mensal</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Mês</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Transações</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Volume (XOF)</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Novos Usuários</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {analytics?.monthlyStats?.map((m) => (
                <tr key={`${m.month}-${m.year}`} className="hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-sm font-medium">{m.month}/{m.year}</td>
                  <td className="px-4 py-3 text-sm text-right">{m.transactions?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{m.volume?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">{m.newUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Métodos */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Métodos de Pagamento Mais Usados</h2>
        <div className="grid gap-4">
          {analytics?.topMethods?.map((m) => (
            <div key={m._id} className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {m._id === 'orange_money' ? '🟠' : m._id === 'mobile_money' ? '📱' : m._id === 'pix' ? '⚡' : m._id === 'iban' ? '🌍' : '🏦'}
                </span>
                <div>
                  <p className="font-medium capitalize">{m._id?.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-gray-400">{m.count} transações</p>
                </div>
              </div>
              <p className="text-lg font-bold font-mono">{m.volume?.toLocaleString()} XOF</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gráfico simples de barras */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Volume de Transações (6 meses)</h2>
        <div className="flex items-end gap-3 h-48">
          {analytics?.monthlyStats?.map((m) => {
            const maxVolume = Math.max(...(analytics?.monthlyStats?.map(s => s.volume) || [1]));
            const height = maxVolume > 0 ? (m.volume / maxVolume) * 100 : 0;
            return (
              <div key={`${m.month}-${m.year}`} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-gray-400">{(m.volume / 1000).toFixed(0)}k</span>
                <div className="w-full bg-primary-600 rounded-t-lg transition-all duration-500" style={{ height: `${Math.max(height, 2)}%` }} />
                <span className="text-xs text-gray-400">{m.month}/{m.year}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
