import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => { loadUsers(); }, [pagination.page, filterStatus]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: 20 };
      if (filterStatus) params.status = filterStatus;
      if (search) params.search = search;
      const { data } = await adminAPI.listUsers(params);
      setUsers(data.users);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch {
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (userId, status) => {
    try {
      const reason = prompt('Motivo da alteração:');
      await adminAPI.updateUserStatus(userId, { status, reason });
      toast.success('Status atualizado');
      loadUsers();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleApproveKYC = async (userId) => {
    try {
      await adminAPI.approveKYC(userId);
      toast.success('KYC aprovado');
      loadUsers();
    } catch {
      toast.error('Erro ao aprovar KYC');
    }
  };

  const statusBadge = (status) => {
    const styles = {
      active: 'badge-success', pending: 'badge-warning',
      suspended: 'badge', blocked: 'badge-error',
    };
    return <span className={styles[status] || 'badge'}>{status}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-gray-400">Gerenciar usuários do sistema</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex gap-4">
          <input
            className="input-field flex-1 bg-gray-700 border-gray-600 text-white"
            placeholder="Buscar por nome, email ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
          />
          <select className="input-field w-40 bg-gray-700 border-gray-600 text-white" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos Status</option>
            <option value="active">Ativos</option>
            <option value="pending">Pendentes</option>
            <option value="suspended">Suspensos</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <button onClick={loadUsers} className="btn-primary">Buscar</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Usuário</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Email</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Telefone</th>
                <th className="text-center px-6 py-4 text-sm font-medium text-gray-300">Status</th>
                <th className="text-center px-6 py-4 text-sm font-medium text-gray-300">KYC</th>
                <th className="text-center px-6 py-4 text-sm font-medium text-gray-300">Saldo</th>
                <th className="text-center px-6 py-4 text-sm font-medium text-gray-300">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold">{u.name?.charAt(0)}</div>
                      <span className="font-medium">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{u.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{u.phone}</td>
                  <td className="px-6 py-4 text-center">{statusBadge(u.status)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`badge ${u.kycStatus === 'verified' ? 'badge-success' : u.kycStatus === 'rejected' ? 'badge-error' : 'badge-warning'}`}>
                      {u.kycStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-mono">{(u.balance || 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center gap-2">
                      <select
                        className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1"
                        value={u.status}
                        onChange={(e) => handleStatusUpdate(u._id, e.target.value)}
                      >
                        <option value="active">Ativar</option>
                        <option value="suspended">Suspender</option>
                        <option value="blocked">Bloquear</option>
                      </select>
                      {u.kycStatus === 'pending' && (
                        <button onClick={() => handleApproveKYC(u._id)} className="text-xs btn-primary py-1">OK KYC</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
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
