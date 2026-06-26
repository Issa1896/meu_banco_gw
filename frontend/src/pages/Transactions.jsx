import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { transactionAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ status: '', type: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => { loadTransactions(); }, [pagination.page]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: 20 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await transactionAPI.list(params);
      setTransactions(data.transactions);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch (error) {
      toast.error('Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReceipt = async (id) => {
    try {
      const response = await transactionAPI.getReceipt(id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `comprovante-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Comprovante baixado');
    } catch (error) {
      toast.error('Erro ao baixar comprovante');
    }
  };

  const statusBadge = (status) => {
    const styles = {
      completed: 'badge-success', pending: 'badge-warning', processing: 'badge-info',
      failed: 'badge-error', cancelled: 'badge bg-gray-100 text-gray-800', reversed: 'badge-info',
    };
    return <span className={styles[status] || 'badge'}>{status}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transações</h1>
          <p className="text-gray-500">Histórico de todas as suas transações</p>
        </div>
        <Link to="/transactions/new" className="btn-primary">Nova Transferência</Link>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <select className="input-field text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Todos Status</option>
            <option value="completed">Completas</option>
            <option value="pending">Pendentes</option>
            <option value="failed">Falhas</option>
          </select>
          <select className="input-field text-sm" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">Todos Tipos</option>
            <option value="transfer">Transferência</option>
            <option value="orange_money">Orange Money</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="pix">PIX</option>
            <option value="iban">IBAN</option>
          </select>
          <input type="date" className="input-field text-sm" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
          <input type="date" className="input-field text-sm" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
          <button onClick={loadTransactions} className="btn-primary text-sm">Filtrar</button>
        </div>
      </div>

      {/* Lista */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-lg">Nenhuma transação encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Referência</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Tipo</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Destinatário</th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Valor</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Data</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {transactions.map((t) => (
                  <tr key={t._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm font-mono">{t.transactionRef?.slice(0, 15)}...</td>
                    <td className="px-6 py-4 text-sm capitalize">{t.paymentMethod?.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-4 text-sm">{t.recipientName || t.recipient?.name || '-'}</td>
                    <td className="px-6 py-4 text-sm font-bold text-right">{t.amount?.toLocaleString()} XOF</td>
                    <td className="px-6 py-4 text-center">{statusBadge(t.status)}</td>
                    <td className="px-6 py-4 text-sm text-right">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleDownloadReceipt(t._id)}
                        className="text-primary-600 hover:text-primary-800 text-sm"
                        disabled={t.status !== 'completed'}
                      >
                        📄 PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page <= 1}
            className="btn-secondary text-sm"
          >
            Anterior
          </button>
          <span className="flex items-center px-4 text-sm">
            Página {pagination.page} de {pagination.pages}
          </span>
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page >= pagination.pages}
            className="btn-secondary text-sm"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
