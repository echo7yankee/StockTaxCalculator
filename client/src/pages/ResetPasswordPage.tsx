import { useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sentry } from '../lib/sentry';
import PasswordInput from '../components/common/PasswordInput';
import { isCommonPassword } from '../components/common/PasswordStrengthMeter';
import PageMeta from '../components/common/PageMeta';

export default function ResetPasswordPage() {
  const { t } = useTranslation(['login', 'common']);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validatePassword = useCallback((value: string) => {
    if (!value) return t('common:validation.required');
    if (value.length < 8) return t('login:passwordTooShort');
    if (isCommonPassword(value)) return t('common:validation.commonPassword');
    return '';
  }, [t]);

  const validateConfirmPassword = useCallback((value: string) => {
    if (!value) return t('common:validation.required');
    if (value !== password) return t('login:passwordsMismatch');
    return '';
  }, [t, password]);

  const handleBlur = (field: string, validator: (v: string) => string, value: string) => {
    const err = validator(value);
    setFieldErrors(prev => {
      if (err) return { ...prev, [field]: err };
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  };

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

    const errors: Record<string, string> = {};
    const passErr = validatePassword(password);
    if (passErr) errors.password = passErr;
    const confirmErr = validateConfirmPassword(confirmPassword);
    if (confirmErr) errors.confirmPassword = confirmErr;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      let res: Response;
      try {
        res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        });
      } catch (err) {
        Sentry.captureException(err, { tags: { action: 'auth.resetPassword', type: 'network' } });
        throw new Error(t('common:validation.networkError'));
      }
      const data = await res.json();
      if (!res.ok) {
        if (res.status >= 500) {
          Sentry.captureException(new Error(`Reset password server error: ${res.status}`), { tags: { action: 'auth.resetPassword', type: 'server' } });
        }
        throw new Error(data.error || t('login:resetFailed'));
      }
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
      <PageMeta titleKey="resetPasswordTitle" descriptionKey="resetPasswordDesc" />
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
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg" role="alert">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <PasswordInput
            id="reset-password"
            label={t('login:newPassword')}
            value={password}
            onChange={(v) => { setPassword(v); if (fieldErrors.password) handleBlur('password', validatePassword, v); }}
            onBlur={() => handleBlur('password', validatePassword, password)}
            placeholder={t('login:newPasswordPlaceholder')}
            autoComplete="new-password"
            required
            minLength={8}
            showStrength
            error={fieldErrors.password}
          />

          <PasswordInput
            id="reset-confirm-password"
            label={t('login:confirmNewPassword')}
            value={confirmPassword}
            onChange={(v) => { setConfirmPassword(v); if (fieldErrors.confirmPassword) handleBlur('confirmPassword', validateConfirmPassword, v); }}
            onBlur={() => handleBlur('confirmPassword', validateConfirmPassword, confirmPassword)}
            placeholder={t('login:confirmNewPasswordPlaceholder')}
            autoComplete="new-password"
            required
            minLength={8}
            error={fieldErrors.confirmPassword}
          />

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? t('login:resettingPassword') : t('login:resetPassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
