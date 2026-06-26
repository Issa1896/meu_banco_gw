import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [show2FA, setShow2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, verify2FA } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(form);
      if (result.requires2FA) {
        setShow2FA(true);
        setUserId(result.userId);
      } else {
        toast.success('Login realizado com sucesso!');
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verify2FA({ userId, token: twoFactorCode });
      toast.success('Login verificado com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Código 2FA inválido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-600 mb-2">MeuBanco GW</h1>
          <p className="text-gray-500 dark:text-gray-400">Sistema de Pagamentos da Guiné-Bissau</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {!show2FA ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="seu@email.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Senha</label>
                <input
                  type="password"
                  className="input-field"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded border-gray-300" />
                  <span>Lembrar-me</span>
                </label>
                <Link to="/forgot-password" className="text-primary-600 hover:underline">
                  Esqueceu a senha?
                </Link>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <div className="text-center text-sm">
                <span className="text-gray-500">Não tem conta?</span>{' '}
                <Link to="/register" className="text-primary-600 hover:underline font-medium">
                  Criar conta
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerify2FA} className="space-y-5">
              <div className="text-center mb-4">
                <div className="text-4xl mb-3">🔐</div>
                <h2 className="text-xl font-bold">Autenticação de Dois Fatores</h2>
                <p className="text-sm text-gray-500 mt-1">Digite o código do seu aplicativo autenticador</p>
              </div>

              <div>
                <input
                  type="text"
                  className="input-field text-center text-2xl tracking-widest"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>

              <button type="submit" disabled={loading || twoFactorCode.length !== 6} className="btn-primary w-full">
                {loading ? 'Verificando...' : 'Verificar'}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <button className="btn-secondary text-sm" onClick={() => navigate('/login')}>
            🔒 Login Biométrico
          </button>
        </div>
      </div>
    </div>
  );
}
