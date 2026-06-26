import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { authAPI, notificationAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profile, setProfile] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [preferences, setPreferences] = useState(user?.preferences?.notifications || { email: true, sms: true, push: true });
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFAQR, setTwoFAQR] = useState('');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAToken, setTwoFAToken] = useState('');

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      const { data } = await authAPI.updateProfile(profile);
      updateUser(data.user);
      toast.success('Perfil atualizado');
    } catch (error) {
      toast.error('Erro ao atualizar');
    }
  };

  const handleUpdatePreferences = async () => {
    try {
      await notificationAPI.updatePreferences(preferences);
      toast.success('Preferências atualizadas');
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const handleSetup2FA = async () => {
    try {
      const { data } = await authAPI.setup2FA();
      setTwoFAQR(data.qrCode);
      setTwoFASecret(data.secret);
      setShow2FASetup(true);
    } catch {
      toast.error('Erro ao configurar 2FA');
    }
  };

  const handleEnable2FA = async () => {
    try {
      await authAPI.enable2FA({ secret: twoFASecret, token: twoFAToken });
      toast.success('2FA ativado com sucesso');
      setShow2FASetup(false);
      updateUser({ twoFactorEnabled: true });
    } catch {
      toast.error('Código inválido');
    }
  };

  const handleDisable2FA = async () => {
    try {
      await authAPI.disable2FA();
      toast.success('2FA desativado');
      updateUser({ twoFactorEnabled: false });
    } catch {
      toast.error('Erro ao desativar');
    }
  };

  const handleBiometricRegister = async () => {
    try {
      // Em produção: usar WebAuthn API real
      const mockKey = `bio-${Date.now()}`;
      await authAPI.registerBiometric({ publicKey: mockKey });
      toast.success('Biometria registrada com sucesso');
      updateUser({ biometricEnabled: true });
    } catch {
      toast.error('Erro ao registrar biometria');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-gray-500">Gerencie sua conta e preferências</p>
      </div>

      {/* Perfil */}
      <form onSubmit={handleUpdateProfile} className="card space-y-4">
        <h2 className="text-lg font-bold">Perfil</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Nome</label>
            <input className="input-field" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1">Telefone</label>
            <input className="input-field" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          </div>
        </div>
        <p className="text-sm text-gray-500">Email: {user?.email}</p>
        <p className="text-sm text-gray-500">Conta: {user?.accountNumber}</p>
        <button type="submit" className="btn-primary">Salvar Perfil</button>
      </form>

      {/* Preferências */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold">Preferências</h2>

        <div>
          <h3 className="font-medium mb-3">Tema</h3>
          <button onClick={toggleTheme} className="btn-secondary">
            {theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
          </button>
        </div>

        <div>
          <h3 className="font-medium mb-3">Notificações</h3>
          <div className="space-y-2">
            {[
              { key: 'email', label: 'Notificações por Email' },
              { key: 'sms', label: 'Notificações por SMS' },
              { key: 'push', label: 'Notificações Push' },
            ].map((n) => (
              <label key={n.key} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={preferences[n.key]}
                  onChange={() => setPreferences({ ...preferences, [n.key]: !preferences[n.key] })}
                />
                <span>{n.label}</span>
              </label>
            ))}
          </div>
          <button onClick={handleUpdatePreferences} className="btn-primary mt-3">Salvar Preferências</button>
        </div>
      </div>

      {/* Segurança */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold">Segurança</h2>

        {/* 2FA */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div>
            <h3 className="font-medium">Autenticação de Dois Fatores (2FA)</h3>
            <p className="text-sm text-gray-500">Proteja sua conta com 2FA</p>
          </div>
          {user?.twoFactorEnabled ? (
            <button onClick={handleDisable2FA} className="btn-danger text-sm">Desativar 2FA</button>
          ) : (
            <button onClick={handleSetup2FA} className="btn-primary text-sm">Ativar 2FA</button>
          )}
        </div>

        {show2FASetup && (
          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg space-y-4 animate-fade-in">
            <h3 className="font-medium">Configurar 2FA</h3>
            <p className="text-sm">Escaneie o QR Code com Google Authenticator ou similar</p>
            {twoFAQR && <img src={twoFAQR} alt="QR Code 2FA" className="mx-auto w-48 h-48" />}
            <p className="text-xs text-gray-500 break-all">Secret: {twoFASecret}</p>
            <div className="flex gap-3">
              <input
                className="input-field flex-1 text-center tracking-widest"
                value={twoFAToken}
                onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
              />
              <button onClick={handleEnable2FA} className="btn-primary" disabled={twoFAToken.length !== 6}>Verificar</button>
            </div>
          </div>
        )}

        {/* Biometria */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div>
            <h3 className="font-medium">Login Biométrico</h3>
            <p className="text-sm text-gray-500">Use sua digital para acessar</p>
          </div>
          <button onClick={handleBiometricRegister} className={`text-sm ${user?.biometricEnabled ? 'btn-secondary' : 'btn-primary'}`}>
            {user?.biometricEnabled ? '✅ Ativo' : 'Ativar'}
          </button>
        </div>
      </div>

      {/* Conta */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-red-600">Zona de Perigo</h2>
        <p className="text-sm text-gray-500">Ações irreversíveis</p>
        <button onClick={logout} className="btn-danger">Sair da Conta</button>
      </div>
    </div>
  );
}
