import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [volume, setVolume] = useState(0);
  const [filters, setFilters] = useState({ status: '', type: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTransactions(); }, [pagination.page]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: 30 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await adminAPI.listTransactions(params);
      setTransactions(data.transactions);
      setVolume(data.volume);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch {
      toast.error('Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status) => {
    const styles = {
      completed: 'badge-success', pending: 'badge-warning', processing: 'badge-info',
      failed: 'badge-error', cancelled: 'badge', reversed: 'badge-info',
    };
    return <span className={styles[status] || 'badge'}>{status}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transações</h1>
          <p className="text-gray-400">Volume total: <span className="font-bold">{volume.toLocaleString()} XOF</span></p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <select className="input-field bg-gray-700 border-gray-600 text-white text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Todos Status</option>
            <option value="completed">Completas</option>
            <option value="pending">Pendentes</option>
            <option value="failed">Falhas</option>
            <option value="processing">Processando</option>
          </select>
          <select className="input-field bg-gray-700 border-gray-600 text-white text-sm" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">Todos Tipos</option>
            <option value="transfer">Transferência</option>
            <option value="orange_money">Orange Money</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="pix">PIX</option>
            <option value="iban">IBAN</option>
          </select>
          <input type="date" className="input-field bg-gray-700 border-gray-600 text-white text-sm" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
          <input type="date" className="input-field bg-gray-700 border-gray-600 text-white text-sm" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
          <button onClick={loadTransactions} className="btn-primary text-sm">Filtrar</button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Ref</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Remetente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Destinatário</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-300">Valor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-300">Método</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-300">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-300">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {transactions.map((t) => (
                <tr key={t._id} className="hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-xs font-mono">{t.transactionRef?.slice(0, 12)}</td>
                  <td className="px-4 py-3 text-sm">{t.sender?.name || t.sender?.email || '-'}</td>
                  <td className="px-4 py-3 text-sm">{t.recipient?.name || t.recipientName || '-'}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right">{t.amount?.toLocaleString()} XOF</td>
                  <td className="px-4 py-3 text-sm text-center capitalize">{t.paymentMethod?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-center">{statusBadge(t.status)}</td>
                  <td className="px-4 py-3 text-sm text-right">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))} disabled={pagination.page <= 1} className="btn-secondary text-sm">Anterior</button>
          <span className="flex items-center px-4 text-sm text-gray-400">Página {pagination.page} de {pagination.pages}</span>
          <button onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))} disabled={pagination.page >= pagination.pages} className="btn-secondary text-sm">Próxima</button>
        </div>
      )}
    </div>
  );
}
