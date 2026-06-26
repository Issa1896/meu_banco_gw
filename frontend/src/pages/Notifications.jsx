import { useState, useEffect } from 'react';
import { notificationAPI } from '../services/api';
import toast from 'react-hot-toast';

const typeIcons = {
  transaction_received: '💰', transaction_sent: '💸', payment_confirmed: '✅',
  payment_failed: '❌', account_credited: '📥', account_debited: '📤',
  budget_alert: '⚠️', monthly_report: '📊', security_alert: '🔒',
  login_alert: '🔑', kyc_update: '📋', system_update: '🔄',
  support_message: '🎧',
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadNotifications(); }, []);

  const loadNotifications = async () => {
    try {
      const { data } = await notificationAPI.list();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      toast.error('Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { toast.error('Erro ao marcar como lida'); }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success('Todas notificações marcadas como lidas');
    } catch { toast.error('Erro'); }
  };

  const handleDelete = async (id) => {
    try {
      await notificationAPI.delete(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      toast.success('Notificação removida');
    } catch { toast.error('Erro ao remover'); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-gray-500">{unreadCount} não lidas</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllAsRead} className="btn-secondary text-sm">Marcar todas como lidas</button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <div className="text-5xl mb-4">🔔</div>
          <p>Nenhuma notificação</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n._id}
              className={`card-hover flex items-start gap-4 ${!n.read ? 'border-l-4 border-l-primary-500 bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
              onClick={() => !n.read && handleMarkAsRead(n._id)}
            >
              <div className="text-2xl">{typeIcons[n.type] || '📬'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`${!n.read ? 'font-bold' : 'font-medium'}`}>{n.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{n.message}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                    {new Date(n.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {n.priority === 'high' && <span className="badge-error text-xs">Importante</span>}
                  {n.priority === 'critical' && <span className="badge-error text-xs">Crítico</span>}
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary-500" />}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(n._id); }} className="text-gray-400 hover:text-red-500 text-sm">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
