import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Register() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      return toast.error('Senhas não coincidem');
    }
    if (form.password.length < 8) {
      return toast.error('Senha deve ter no mínimo 8 caracteres');
    }
    setLoading(true);
    try {
      await register({
        name: form.name, email: form.email,
        phone: form.phone, password: form.password,
      });
      toast.success('Conta criada com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-600 mb-2">MeuBanco GW</h1>
          <p className="text-gray-500 dark:text-gray-400">Crie sua conta gratuitamente</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nome completo</label>
              <input name="name" type="text" className="input-field" value={form.name} onChange={handleChange} placeholder="Seu nome" required />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input name="email" type="email" className="input-field" value={form.email} onChange={handleChange} placeholder="seu@email.com" required />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Telefone (+245)</label>
              <input name="phone" type="tel" className="input-field" value={form.phone} onChange={handleChange} placeholder="955XXXXXX" required />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Senha</label>
              <input name="password" type="password" className="input-field" value={form.password} onChange={handleChange} placeholder="Mínimo 8 caracteres" required />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Confirmar senha</label>
              <input name="confirmPassword" type="password" className="input-field" value={form.confirmPassword} onChange={handleChange} placeholder="Repita a senha" required />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Criando conta...' : 'Criar Conta'}
            </button>

            <div className="text-center text-sm">
              <span className="text-gray-500">Já tem conta?</span>{' '}
              <Link to="/login" className="text-primary-600 hover:underline font-medium">Entrar</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
