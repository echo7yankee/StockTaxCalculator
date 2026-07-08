import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { reportCaughtError } from '../lib/errorMonitor';
import { analytics } from '../lib/analytics';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  // Derived server-side from the ADMIN_EMAILS allowlist (see /api/auth sanitizeUser).
  // Used only to show/hide the admin analytics link; access is gated server-side.
  isAdmin: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export class ApiError extends Error {
  fields?: Record<string, string>;
  constructor(message: string, fields?: Record<string, string>) {
    super(message);
    this.fields = fields;
  }
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: (redirect?: string) => void;
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
    let res: Response;
    try {
      res = await fetch('/api/auth/login', {
        ...fetchOpts,
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      reportCaughtError(err, 'auth.login:network');
      throw new ApiError('Unable to connect to the server. Please check your connection and try again.');
    }
    const data = await res.json();
    if (!res.ok) {
      if (res.status >= 500) {
        reportCaughtError(new Error(`Login server error: ${res.status}`), 'auth.login:server');
      }
      throw new ApiError(data.error || 'Login failed', data.fields);
    }
    setUser(data.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    let res: Response;
    try {
      res = await fetch('/api/auth/signup', {
        ...fetchOpts,
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      });
    } catch (err) {
      reportCaughtError(err, 'auth.signup:network');
      throw new ApiError('Unable to connect to the server. Please check your connection and try again.');
    }
    const data = await res.json();
    if (!res.ok) {
      if (res.status >= 500) {
        reportCaughtError(new Error(`Signup server error: ${res.status}`), 'auth.signup:server');
      }
      throw new ApiError(data.error || 'Signup failed', data.fields);
    }
    setUser(data.user);
    analytics.signupCompleted();
  }, []);

  // Threads the post-login destination (a same-site path like /pricing) through the
  // OAuth round-trip; the server validates it on both legs and falls back to /dashboard.
  const loginWithGoogle = useCallback((redirect?: string) => {
    window.location.href = redirect
      ? `/api/auth/google?redirect=${encodeURIComponent(redirect)}`
      : '/api/auth/google';
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { ...fetchOpts, method: 'POST' });
    } catch {
      // Clear local state even if server is unreachable — user shouldn't be stuck "logged in"
    }
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch('/api/auth/delete-account', { ...fetchOpts, method: 'POST' });
    } catch (err) {
      reportCaughtError(err, 'auth.deleteAccount:network');
      throw new Error('Unable to connect to the server. Please check your connection and try again.');
    }
    const data = await res.json();
    if (!res.ok) {
      if (res.status >= 500) {
        reportCaughtError(new Error(`Delete account server error: ${res.status}`), 'auth.deleteAccount:server');
      }
      throw new Error(data.error || 'Failed to delete account');
    }
    setUser(null);
  }, []);

  const exportData = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch('/api/auth/export-data', { credentials: 'include' });
    } catch (err) {
      reportCaughtError(err, 'auth.exportData:network');
      throw new Error('Unable to connect to the server. Please check your connection and try again.');
    }
    if (!res.ok) {
      if (res.status >= 500) {
        reportCaughtError(new Error(`Export data server error: ${res.status}`), 'auth.exportData:server');
      }
      throw new Error('Failed to export data');
    }
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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
