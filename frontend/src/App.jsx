import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import NewTransfer from './pages/NewTransfer';
import Budgets from './pages/Budgets';
import Notifications from './pages/Notifications';
import Support from './pages/Support';
import Settings from './pages/Settings';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminTickets from './pages/admin/Tickets';
import AdminAnalytics from './pages/admin/Analytics';
import AdminLedger from './pages/admin/Ledger';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.role !== 'admin' && user?.role !== 'superadmin') return <Navigate to="/dashboard" />;
  return children;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
        <p className="text-gray-500 dark:text-gray-400">Carregando...</p>
      </div>
    </div>
  );
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return isAuthenticated ? <Navigate to="/dashboard" /> : children;
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { borderRadius: '12px', padding: '16px' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        {/* User Routes */}
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="transactions/new" element={<NewTransfer />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="support" element={<Support />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<Navigate to="/admin/dashboard" />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="ledger" element={<AdminLedger />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </>
  );
}
