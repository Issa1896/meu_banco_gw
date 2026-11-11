import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor para adicionar token
api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken') || localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Rotas de autenticação (login, 2FA, refresh...) devolvem 401 por credencial
    // errada; nelas não se tenta refresh nem redireciona.
    const isAuthRoute = originalRequest?.url?.startsWith('/auth/')
      && !originalRequest.url.startsWith('/auth/profile');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;

      try {
        const refreshToken = Cookies.get('refreshToken') || localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });

        Cookies.set('accessToken', data.accessToken, { expires: 7, secure: true, sameSite: 'strict' });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        Cookies.remove('accessToken');
        Cookies.remove('refreshToken');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// API Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  verify2FA: (data) => api.post('/auth/verify-2fa', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  setup2FA: () => api.get('/auth/2fa/setup'),
  enable2FA: (data) => api.post('/auth/2fa/enable', data),
  disable2FA: (data) => api.post('/auth/2fa/disable', data),
  registerBiometric: (data) => api.post('/auth/biometric/register', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
};

// API Transações
export const transactionAPI = {
  transfer: (data) => api.post('/transactions/transfer', data),
  list: (params) => api.get('/transactions', { params }),
  getById: (id) => api.get(`/transactions/${id}`),
  getStats: () => api.get('/transactions/stats'),
  getBalance: () => api.get('/transactions/balance'),
  getMonthlyReport: (params) => api.get('/transactions/monthly-report', { params }),
  reverse: (id, data) => api.post(`/transactions/${id}/reverse`, data),
  getReceipt: (id) => api.get(`/transactions/${id}/receipt`, { responseType: 'blob' }),
};

// API Orçamentos
export const budgetAPI = {
  create: (data) => api.post('/budgets', data),
  list: (params) => api.get('/budgets', { params }),
  getSummary: () => api.get('/budgets/summary'),
  update: (id, data) => api.put(`/budgets/${id}`, data),
  delete: (id) => api.delete(`/budgets/${id}`),
};

// API Notificações
export const notificationAPI = {
  list: (params) => api.get('/notifications', { params }),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  updatePreferences: (data) => api.put('/notifications/preferences', data),
  delete: (id) => api.delete(`/notifications/${id}`),
};

// API Tickets
export const ticketAPI = {
  create: (data) => api.post('/tickets', data),
  list: (params) => api.get('/tickets', { params }),
  getById: (id) => api.get(`/tickets/${id}`),
  reply: (id, data) => api.post(`/tickets/${id}/reply`, data),
  close: (id) => api.put(`/tickets/${id}/close`),
};

// API Admin
export const adminAPI = {
  getDashboard: () => api.get('/admin/dashboard'),
  listUsers: (params) => api.get('/admin/users', { params }),
  getUserById: (id) => api.get(`/admin/users/${id}`),
  updateUserStatus: (id, data) => api.put(`/admin/users/${id}/status`, data),
  approveKYC: (id) => api.put(`/admin/users/${id}/kyc/approve`),
  rejectKYC: (id, data) => api.put(`/admin/users/${id}/kyc/reject`, data),
  listTickets: (params) => api.get('/admin/tickets', { params }),
  replyTicket: (id, data) => api.post(`/admin/tickets/${id}/reply`, data),
  listTransactions: (params) => api.get('/admin/transactions', { params }),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  getAnalytics: () => api.get('/admin/analytics'),
};

export default api;
