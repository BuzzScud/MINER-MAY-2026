import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { migrateLocalToApi } from '../utils/storage';

const SESSION_TOKEN = '__cookie_session__';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);

  const setToken = useCallback((newToken) => {
    if (newToken) {
      setTokenState(newToken);
    } else {
      setTokenState(null);
      setUser(null);
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(res.ok ? 'Invalid response from server' : 'Login failed. Check that the API server is running.');
    }
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setMigrationPending(true);
    setToken(SESSION_TOKEN);
    setUser(data.user);
    try {
      await migrateLocalToApi(SESSION_TOKEN);
    } finally {
      setMigrationPending(false);
    }
    return data;
  }, [setToken]);

  const register = useCallback(async (username, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(res.ok ? 'Invalid response from server' : 'Registration failed. Check that the API server is running.');
    }
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setMigrationPending(true);
    setToken(SESSION_TOKEN);
    setUser(data.user);
    try {
      await migrateLocalToApi(SESSION_TOKEN);
    } finally {
      setMigrationPending(false);
    }
    return data;
  }, [setToken]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best effort; still clear local auth state.
    }
    setMigrationPending(false);
    setToken(null);
  }, [setToken]);

  useEffect(() => {
    fetch('/api/auth/me', {
      credentials: 'include',
    })
      .then(async (res) => {
        if (res.status === 401) {
          setTokenState(null);
          setUser(null);
          return null;
        }
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (data?.user) {
          setTokenState(SESSION_TOKEN);
          setUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetch('/api/auth/me', { credentials: 'include' })
        .then(async (res) => {
          if (res.status === 401) setToken(null);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [token, setToken]);

  const value = {
    user,
    token,
    loading,
    migrationPending,
    login,
    register,
    logout,
    isAuthenticated: !!user,
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
