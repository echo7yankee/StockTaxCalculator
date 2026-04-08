import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ForgotPasswordPage() {
  const { t } = useTranslation(['login', 'common']);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('login:resetRequestFailed'));
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login:resetRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="card text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t('login:checkEmail')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            {t('login:resetEmailSent')}
          </p>
          <Link to="/login" className="text-accent hover:underline font-medium text-sm">
            {t('login:backToLogin')}
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
          <h1 className="text-2xl font-bold">{t('login:forgotPasswordTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {t('login:forgotPasswordSubtitle')}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('common:email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              placeholder={t('login:emailPlaceholder')}
              required
              autoComplete="email"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? t('login:sendingResetLink') : t('login:sendResetLink')}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 dark:text-slate-400 mt-6">
          <Link to="/login" className="text-accent hover:underline font-medium">
            {t('login:backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
