import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { analytics } from '../lib/analytics';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  exportData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const fetchOpts: RequestInit = { credentials: 'include', headers: { 'Content-Type': 'application/json' } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      ...fetchOpts,
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setUser(data.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch('/api/auth/signup', {
      ...fetchOpts,
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
    setUser(data.user);
    analytics.signupCompleted();
  }, []);

  const loginWithGoogle = useCallback(() => {
    window.location.href = '/api/auth/google';
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { ...fetchOpts, method: 'POST' });
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    const res = await fetch('/api/auth/delete-account', { ...fetchOpts, method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete account');
    setUser(null);
  }, []);

  const exportData = useCallback(async () => {
    const res = await fetch('/api/auth/export-data', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to export data');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investax-data.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, loginWithGoogle, logout, deleteAccount, exportData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
