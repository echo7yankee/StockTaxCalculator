import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ResetPasswordPage() {
  const { t } = useTranslation(['login', 'common']);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="card text-center">
          <h1 className="text-2xl font-bold mb-2">{t('login:invalidResetLink')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            {t('login:invalidResetLinkDescription')}
          </p>
          <Link to="/forgot-password" className="text-accent hover:underline font-medium text-sm">
            {t('login:requestNewLink')}
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(t('login:passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('login:passwordsMismatch'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('login:resetFailed'));
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login:resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="card text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t('login:passwordResetSuccess')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            {t('login:passwordResetSuccessDescription')}
          </p>
          <Link to="/login" className="btn-primary inline-block px-6 py-2.5">
            {t('common:logIn')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <div className="card">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-2xl font-bold">{t('login:setNewPassword')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {t('login:setNewPasswordSubtitle')}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('login:newPassword')}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input pr-10"
                placeholder={t('login:newPasswordPlaceholder')}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('login:confirmNewPassword')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="input"
              placeholder={t('login:confirmNewPasswordPlaceholder')}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? t('login:resettingPassword') : t('login:resetPassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
