import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '../../shared/types';
import { ApiError, apiRequest, setCsrfToken as storeCsrfToken } from '../api/client';

type AuthResponse = {
  user: User;
  csrfToken: string;
};

type AuthContextValue = {
  user: User | null;
  csrfToken: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [csrfToken, setCsrfTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    apiRequest<AuthResponse>('/api/auth/me')
      .then((response) => {
        if (!active) return;
        setSession(response);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error(error);
        }
        clearSession();
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function setSession(response: AuthResponse) {
    setUser(response.user);
    setCsrfTokenState(response.csrfToken);
    storeCsrfToken(response.csrfToken);
  }

  function clearSession() {
    setUser(null);
    setCsrfTokenState(null);
    storeCsrfToken(null);
  }

  async function login(username: string, password: string) {
    const response = await apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    });
    setSession(response);
  }

  async function logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }

  const value = useMemo(
    () => ({ user, csrfToken, loading, login, logout }),
    [csrfToken, loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
