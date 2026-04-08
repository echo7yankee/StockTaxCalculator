import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormField from '../components/common/FormField';

export default function ForgotPasswordPage() {
  const { t } = useTranslation(['login', 'common']);
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validateEmail = useCallback((value: string) => {
    if (!value) return t('common:validation.required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return t('common:validation.invalidEmail');
    return '';
  }, [t]);

  const handleBlur = (field: string, validator: (v: string) => string, value: string) => {
    const err = validator(value);
    setFieldErrors(prev => {
      if (err) return { ...prev, [field]: err };
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const emailErr = validateEmail(email);
    if (emailErr) {
      setFieldErrors({ email: emailErr });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
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
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg" role="alert">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField
            id="forgot-email"
            label={t('common:email')}
            error={fieldErrors.email}
            required
          >
            {(props) => (
              <input
                {...props}
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); if (fieldErrors.email) handleBlur('email', validateEmail, e.target.value); }}
                onBlur={() => handleBlur('email', validateEmail, email)}
                placeholder={t('login:emailPlaceholder')}
                autoComplete="email"
              />
            )}
          </FormField>
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
