import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { adminAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const fmt = (v) => `${Number(v || 0).toLocaleString('pt-PT')} XOF`;

const ACCOUNT_LABELS = {
  'system:fees': 'Receita de taxas',
  'system:opening': 'Saldos de abertura',
  'system:adjustments': 'Ajustes manuais',
};
const accountLabel = (a) => ACCOUNT_LABELS[a] || (a.startsWith('user:') ? `Cliente ${a.slice(5, 13)}…` : a);

export default function AdminLedger() {
  const { user } = useAuth();
  const [recon, setRecon] = useState(null);
  const [trial, setTrial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adj, setAdj] = useState({ userId: '', amount: '', reason: '' });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Conciliação com divergência responde 409, mas o corpo é o relatório
      const reconRes = await adminAPI.ledgerReconciliation().catch((e) => {
        if (e.response?.status === 409) return e.response;
        throw e;
      });
      const trialRes = await adminAPI.ledgerTrialBalance();
      setRecon(reconRes.data);
      setTrial(trialRes.data);
    } catch {
      toast.error('Erro ao carregar o livro-razão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitAdjustment = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const { data } = await adminAPI.ledgerAdjustment({
        userId: adj.userId.trim(), amount: parseInt(adj.amount, 10), reason: adj.reason,
      });
      toast.success(`Ajuste lançado (${data.journalRef})`);
      setAdj({ userId: '', amount: '', reason: '' });
      load();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao lançar ajuste');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  }

  const systemAccounts = trial?.accounts.filter((a) => a.account.startsWith('system:')) || [];
  const customerTotal = (trial?.accounts || [])
    .filter((a) => a.account.startsWith('user:'))
    .reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6 animate-fade-in text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Livro-razão</h1>
          <p className="text-gray-400">Partidas dobradas, conciliação e ajustes</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm">Atualizar</button>
      </div>

      {/* Conciliação */}
      <div className={`rounded-xl p-6 ${recon?.ok ? 'bg-green-900/40 border border-green-700' : 'bg-red-900/40 border border-red-700'}`}>
        <h2 className="text-lg font-bold">{recon?.ok ? '✅ Conciliação OK' : '⚠️ Divergência encontrada'}</h2>
        <p className="text-sm text-gray-300 mt-1">
          {recon?.usersChecked} contas conferidas · balancete {recon?.balanced ? 'fechado' : 'NÃO fechado'} ·{' '}
          {recon && new Date(recon.checkedAt).toLocaleString('pt-PT')}
        </p>
        {recon?.mismatches?.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead><tr className="text-gray-300">
                <th className="text-left py-2">Conta</th>
                <th className="text-right py-2">Saldo cadastrado</th>
                <th className="text-right py-2">Saldo no razão</th>
                <th className="text-right py-2">Diferença</th>
              </tr></thead>
              <tbody>
                {recon.mismatches.map((m) => (
                  <tr key={String(m.userId)} className="border-t border-red-800">
                    <td className="py-2">{m.accountNumber || String(m.userId)} {m.name ? `— ${m.name}` : ''}</td>
                    <td className="py-2 text-right">{m.cachedBalance === null ? '—' : fmt(m.cachedBalance)}</td>
                    <td className="py-2 text-right">{fmt(m.ledgerBalance)}</td>
                    <td className="py-2 text-right font-bold">{fmt(m.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Balancete */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Balancete</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-700"><tr>
              <th className="text-left px-4 py-3 text-gray-300">Conta</th>
              <th className="text-right px-4 py-3 text-gray-300">Débitos</th>
              <th className="text-right px-4 py-3 text-gray-300">Créditos</th>
              <th className="text-right px-4 py-3 text-gray-300">Saldo</th>
            </tr></thead>
            <tbody>
              {systemAccounts.map((a) => (
                <tr key={a.account} className="border-t border-gray-700">
                  <td className="px-4 py-3">{accountLabel(a.account)} <span className="text-gray-500">({a.account})</span></td>
                  <td className="px-4 py-3 text-right">{fmt(a.debit)}</td>
                  <td className="px-4 py-3 text-right">{fmt(a.credit)}</td>
                  <td className="px-4 py-3 text-right">{fmt(a.balance)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-700">
                <td className="px-4 py-3">Carteiras de clientes (total)</td>
                <td className="px-4 py-3" colSpan={2} />
                <td className="px-4 py-3 text-right">{fmt(customerTotal)}</td>
              </tr>
              <tr className="border-t-2 border-gray-500 font-bold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{fmt(trial?.totalDebit)}</td>
                <td className="px-4 py-3 text-right">{fmt(trial?.totalCredit)}</td>
                <td className="px-4 py-3 text-right">{trial?.balanced ? '✅' : '❌'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Ajuste manual */}
      {user?.role === 'superadmin' && (
        <form onSubmit={submitAdjustment} className="bg-gray-800 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-bold">Ajuste manual de saldo</h2>
          <p className="text-sm text-gray-400">
            Valor positivo credita, negativo debita. Fica registrado no razão e na auditoria e não pode ser apagado.
          </p>
          <input className="input-field w-full" placeholder="ID do usuário" value={adj.userId}
            onChange={(e) => setAdj({ ...adj, userId: e.target.value })} />
          <input className="input-field w-full" placeholder="Valor em XOF (ex.: 5000 ou -5000)" inputMode="numeric"
            value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value.replace(/[^\d-]/g, '') })} />
          <input className="input-field w-full" placeholder="Motivo (mín. 10 caracteres)" value={adj.reason}
            onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
          <button type="submit" className="btn-primary"
            disabled={sending || !adj.userId || !adj.amount || adj.reason.trim().length < 10}>
            {sending ? 'Lançando...' : 'Lançar ajuste'}
          </button>
        </form>
      )}
    </div>
  );
}
