import { useState, useEffect } from 'react';
import { ticketAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function Support() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [form, setForm] = useState({ subject: '', category: 'general', priority: 'medium', message: '' });
  const [replyMessage, setReplyMessage] = useState('');

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    try {
      const { data } = await ticketAPI.list();
      setTickets(data.tickets);
    } catch {
      toast.error('Erro ao carregar tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await ticketAPI.create(form);
      toast.success('Ticket criado com sucesso!');
      setShowNewTicket(false);
      setForm({ subject: '', category: 'general', priority: 'medium', message: '' });
      loadTickets();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao criar ticket');
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;
    try {
      await ticketAPI.reply(selectedTicket._id, { message: replyMessage });
      toast.success('Resposta enviada');
      setReplyMessage('');
      const { data } = await ticketAPI.getById(selectedTicket._id);
      setSelectedTicket(data.ticket);
      loadTickets();
    } catch {
      toast.error('Erro ao enviar resposta');
    }
  };

  const handleClose = async (id) => {
    try {
      await ticketAPI.close(id);
      toast.success('Ticket fechado');
      setSelectedTicket(null);
      loadTickets();
    } catch {
      toast.error('Erro ao fechar ticket');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suporte</h1>
          <p className="text-gray-500">Estamos aqui para ajudar 24/7</p>
        </div>
        {!selectedTicket && (
          <button onClick={() => setShowNewTicket(!showNewTicket)} className="btn-primary">
            {showNewTicket ? 'Cancelar' : 'Novo Ticket'}
          </button>
        )}
      </div>

      {selectedTicket ? (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => setSelectedTicket(null)} className="text-sm text-primary-600 hover:underline">← Voltar</button>
              <h2 className="text-lg font-bold mt-1">{selectedTicket.subject}</h2>
              <span className={`badge ${selectedTicket.status === 'open' ? 'badge-warning' : selectedTicket.status === 'resolved' ? 'badge-success' : 'badge-info'}`}>
                {selectedTicket.status}
              </span>
            </div>
            {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
              <button onClick={() => handleClose(selectedTicket._id)} className="btn-danger text-sm">Fechar Ticket</button>
            )}
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            {selectedTicket.messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.isAI ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] p-3 rounded-xl ${msg.isAI ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600' : 'bg-primary-600 text-white'}`}>
                  {msg.isAI && <p className="text-xs text-gray-400 mb-1">🤖 Assistente IA</p>}
                  <p className="text-sm">{msg.message}</p>
                  <p className="text-xs mt-1 opacity-70">{new Date(msg.createdAt).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </div>

          {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
            <form onSubmit={handleReply} className="flex gap-3">
              <input
                className="input-field flex-1"
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
                required
              />
              <button type="submit" className="btn-primary">Enviar</button>
            </form>
          )}
        </div>
      ) : showNewTicket ? (
        <form onSubmit={handleCreate} className="card space-y-4 animate-fade-in">
          <h2 className="text-lg font-bold">Novo Ticket de Suporte</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Assunto</label>
              <input className="input-field" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm mb-1">Categoria</label>
              <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="general">Geral</option>
                <option value="technical">Técnico</option>
                <option value="payment">Pagamento</option>
                <option value="security">Segurança</option>
                <option value="account">Conta</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">Prioridade</label>
            <select className="input-field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Mensagem</label>
            <textarea className="input-field h-32 resize-none" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
          </div>
          <button type="submit" className="btn-primary w-full">Enviar Ticket</button>
        </form>
      ) : (
        <div className="space-y-2">
          <div className="card bg-gradient-to-r from-primary-600 to-primary-800 text-white border-0">
            <div className="flex items-center gap-4">
              <span className="text-4xl">🤖</span>
              <div>
                <h3 className="font-bold">Assistente Virtual IA</h3>
                <p className="text-primary-100 text-sm">Suporte inteligente disponível 24 horas por dia</p>
              </div>
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <div className="text-5xl mb-4">🎧</div>
              <p className="text-lg">Nenhum ticket de suporte</p>
              <p className="text-sm mt-1">Crie um ticket para receber ajuda</p>
            </div>
          ) : (
            tickets.map((t) => (
              <div key={t._id} className="card-hover" onClick={() => setSelectedTicket(t)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl ${t.priority === 'urgent' ? 'animate-pulse' : ''}`}>
                      {t.priority === 'urgent' ? '🚨' : t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'}
                    </span>
                    <div>
                      <p className="font-medium">{t.subject}</p>
                      <p className="text-sm text-gray-500 capitalize">{t.category} - {t.messages.length} mensagens</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${t.status === 'open' ? 'badge-warning' : t.status === 'resolved' ? 'badge-success' : 'badge-info'}`}>{t.status}</span>
                    <p className="text-xs text-gray-400 mt-1">{new Date(t.updatedAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
