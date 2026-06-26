import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import Cookies from 'js-cookie';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = Cookies.get('accessToken') || localStorage.getItem('accessToken');
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  const loadUser = async () => {
    try {
      const { data } = await authAPI.getProfile();
      setUser(data.user);
      setIsAuthenticated(true);
      connectSocket();
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async (credentials) => {
    const { data } = await authAPI.login(credentials);

    if (data.requires2FA) {
      return { requires2FA: true, userId: data.userId };
    }

    setUser(data.user);
    setIsAuthenticated(true);
    Cookies.set('accessToken', data.accessToken, { expires: 7, secure: true, sameSite: 'strict' });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    connectSocket();
    return { success: true };
  }, []);

  const verify2FA = useCallback(async (data2FA) => {
    const { data } = await authAPI.verify2FA(data2FA);
    setUser(data.user);
    setIsAuthenticated(true);
    Cookies.set('accessToken', data.accessToken, { expires: 7, secure: true, sameSite: 'strict' });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    connectSocket();
    return { success: true };
  }, []);

  const register = useCallback(async (userData) => {
    const { data } = await authAPI.register(userData);
    setUser(data.user);
    setIsAuthenticated(true);
    Cookies.set('accessToken', data.accessToken, { expires: 7, secure: true, sameSite: 'strict' });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    connectSocket();
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch { /* ignore */ }
    setUser(null);
    setIsAuthenticated(false);
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    disconnectSocket();
  }, []);

  const updateUser = useCallback((updates) => {
    setUser(prev => ({ ...prev, ...updates }));
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated,
      login,
      register,
      logout,
      verify2FA,
      updateUser,
      loadUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
