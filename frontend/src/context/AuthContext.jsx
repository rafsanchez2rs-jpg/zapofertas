import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    api.post('/auth/logout', { refreshToken }).catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      // Verificar se precisa de setup antes de mostrar login
      api.get('/auth/setup-required')
        .then(({ data }) => setSetupRequired(data.required))
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    api.get('/auth/me')
      .then(({ data }) => setUser({ ...data.user, role: data.user.role || 'user' }))
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser({ ...data.user, role: data.user.role || 'user' });
    return data.user;
  };

  const register = async (email, password, name, invite) => {
    const body = { email, password, name };
    if (invite) body.invite = invite;
    const { data } = await api.post('/auth/register', body);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser({ ...data.user, role: data.user.role || 'user' });
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, setupRequired, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
