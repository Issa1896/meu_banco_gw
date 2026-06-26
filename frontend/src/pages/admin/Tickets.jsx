import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    try {
      const { data } = await adminAPI.listTickets();
      setTickets(data.tickets);
    } catch {
      toast.error('Erro ao carregar tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;
    try {
      await adminAPI.replyTicket(selectedTicket._id, { message: replyMessage });
      toast.success('Resposta enviada');
      setReplyMessage('');
      const { data } = await adminAPI.listTickets();
      const updated = data.tickets.find(t => t._id === selectedTicket._id);
      if (updated) setSelectedTicket(updated);
      loadTickets();
    } catch {
      toast.error('Erro ao enviar resposta');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  return (
    <div className="space-y-6 animate-fade-in text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tickets de Suporte</h1>
          <p className="text-gray-400">{tickets.length} tickets pendentes</p>
        </div>
      </div>

      {selectedTicket ? (
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => setSelectedTicket(null)} className="text-sm text-primary-400 hover:underline">← Voltar</button>
              <h2 className="text-lg font-bold mt-1">{selectedTicket.subject}</h2>
              <div className="flex gap-2 mt-1">
                <span className={`badge ${selectedTicket.status === 'open' ? 'badge-warning' : 'badge-success'}`}>{selectedTicket.status}</span>
                <span className={`badge ${selectedTicket.priority === 'urgent' ? 'badge-error' : selectedTicket.priority === 'high' ? 'badge-warning' : 'badge-info'}`}>{selectedTicket.priority}</span>
              </div>
            </div>
            <p className="text-sm text-gray-400">{selectedTicket.user?.name || selectedTicket.user?.email}</p>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto p-4 bg-gray-700/50 rounded-lg">
            {selectedTicket.messages?.map((msg, i) => (
              <div key={i} className={`flex ${msg.isAI ? 'justify-start' : msg.sender === selectedTicket.user?._id ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] p-3 rounded-xl ${msg.isAI ? 'bg-gray-600 border border-gray-500' : msg.sender === selectedTicket.user?._id ? 'bg-gray-600' : 'bg-primary-600'}`}>
                  <p className="text-sm">{msg.message}</p>
                  <p className="text-xs mt-1 opacity-70">{new Date(msg.createdAt).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </div>

          {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
            <form onSubmit={handleReply} className="flex gap-3">
              <input className="input-field flex-1 bg-gray-700 border-gray-600 text-white" value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} placeholder="Digite sua resposta..." required />
              <button type="submit" className="btn-primary">Responder</button>
            </form>
          )}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {tickets.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-5xl mb-4">🎫</div>
              <p>Nenhum ticket encontrado</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Usuário</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Assunto</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-300">Prioridade</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-300">Status</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-300">Data</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-300">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {tickets.map((t) => (
                  <tr key={t._id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm">{t.user?.name || t.user?.email || '-'}</td>
                    <td className="px-6 py-4 text-sm font-medium">{t.subject}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`badge ${t.priority === 'urgent' ? 'badge-error' : t.priority === 'high' ? 'badge-warning' : 'badge-info'}`}>{t.priority}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`badge ${t.status === 'open' ? 'badge-warning' : t.status === 'resolved' ? 'badge-success' : 'badge-info'}`}>{t.status}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => setSelectedTicket(t)} className="text-primary-400 hover:text-primary-300 text-sm">Abrir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
