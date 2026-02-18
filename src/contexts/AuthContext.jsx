import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { migrateLocalToApi } from '../utils/storage';

const TOKEN_KEY = 'algonov_jwt';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);

  const setToken = useCallback((newToken) => {
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken);
      setTokenState(newToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
      setUser(null);
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setUser(data.user);
    migrateLocalToApi(data.token).catch(() => {});
    return data;
  }, [setToken]);

  const register = useCallback(async (username, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setToken(data.token);
    setUser(data.user);
    migrateLocalToApi(data.token).catch(() => {});
    return data;
  }, [setToken]);

  const logout = useCallback(() => {
    setToken(null);
  }, [setToken]);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setTokenState(null);
          setUser(null);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setTokenState(stored);
          setUser(data.user);
        } else if (stored) {
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (res.status === 401) {
            setToken(null);
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [token, setToken]);

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
