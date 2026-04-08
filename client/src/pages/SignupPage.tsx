import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth, ApiError } from '../contexts/AuthContext';
import FormField from '../components/common/FormField';
import PasswordInput from '../components/common/PasswordInput';
import { isCommonPassword } from '../components/common/PasswordStrengthMeter';
import PageMeta from '../components/common/PageMeta';

export default function SignupPage() {
  const { t } = useTranslation(['signup', 'common']);
  const navigate = useNavigate();
  const { signup, loginWithGoogle } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = useCallback((value: string) => {
    if (!value) return t('common:validation.required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return t('common:validation.invalidEmail');
    if (value.length > 254) return t('common:validation.emailTooLong');
    return '';
  }, [t]);

  const validatePassword = useCallback((value: string) => {
    if (!value) return t('common:validation.required');
    if (value.length < 8) return t('signup:passwordTooShort');
    if (isCommonPassword(value)) return t('common:validation.commonPassword');
    return '';
  }, [t]);

  const validateConfirmPassword = useCallback((value: string) => {
    if (!value) return t('common:validation.required');
    if (value !== password) return t('signup:passwordsMismatch');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const errors: Record<string, string> = {};
    const emailErr = validateEmail(email);
    if (emailErr) errors.email = emailErr;
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
      await signup(email.trim(), password, name.trim());
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setFieldErrors(err.fields);
      }
      setError(err instanceof Error ? err.message : t('signup:signupFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <PageMeta titleKey="signupTitle" descriptionKey="signupDesc" />
      <div className="card">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-2xl font-bold">{t('signup:createAccount')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {t('signup:signupSubtitle')}
          </p>
        </div>

        {error && !Object.keys(fieldErrors).length && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg" role="alert">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField id="signup-name" label={t('common:name')}>
            {(props) => (
              <input
                {...props}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('signup:namePlaceholder')}
                autoComplete="name"
                maxLength={100}
              />
            )}
          </FormField>

          <FormField
            id="signup-email"
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
                placeholder={t('signup:emailPlaceholder')}
                autoComplete="email"
                inputMode="email"
                maxLength={254}
              />
            )}
          </FormField>

          <PasswordInput
            id="signup-password"
            label={t('common:password')}
            value={password}
            onChange={(v) => { setPassword(v); if (fieldErrors.password) handleBlur('password', validatePassword, v); }}
            onBlur={() => handleBlur('password', validatePassword, password)}
            placeholder={t('signup:passwordPlaceholder')}
            autoComplete="new-password"
            required
            minLength={8}
            showStrength
            error={fieldErrors.password}
          />

          <PasswordInput
            id="signup-confirm-password"
            label={t('signup:confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(v) => { setConfirmPassword(v); if (fieldErrors.confirmPassword) handleBlur('confirmPassword', validateConfirmPassword, v); }}
            onBlur={() => handleBlur('confirmPassword', validateConfirmPassword, confirmPassword)}
            placeholder={t('signup:confirmPasswordPlaceholder')}
            autoComplete="new-password"
            required
            minLength={8}
            error={fieldErrors.confirmPassword}
          />

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? t('signup:creatingAccount') : t('signup:createAccount')}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-navy-600" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white dark:bg-navy-800 px-2 text-gray-400 dark:text-slate-500">{t('common:or')}</span>
          </div>
        </div>

        <button
          onClick={loginWithGoogle}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-navy-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {t('signup:continueWithGoogle')}
        </button>

        <p className="text-center text-sm text-gray-500 dark:text-slate-400 mt-6">
          {t('signup:hasAccount')}{' '}
          <Link to="/login" className="text-accent hover:underline font-medium">
            {t('common:logIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
