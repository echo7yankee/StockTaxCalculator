import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Mail, Check, AlertCircle } from 'lucide-react';

export type SubscribeTopic = 'filing_reminder' | 'broker_revolut' | 'broker_ibkr' | 'prior_years';
type Status = 'idle' | 'submitting' | 'success' | 'error';

interface EmailCaptureProps {
  // Which list to join. The backend keys one row per (email, topic).
  topic: SubscribeTopic;
  // Where the capture was shown (calculator, ghid-revolut, ...). Stored for
  // attribution; optional.
  source?: string;
  // Selects the default copy from the `subscribe` namespace. 'filing' for the
  // season reminder, 'broker' for a beta-graduation waitlist.
  variant?: 'filing' | 'broker';
  // Copy overrides for RO-hardcoded pages (e.g. the ghid guides) that do not go
  // through i18n. When omitted, copy comes from the `subscribe` namespace.
  heading?: string;
  description?: string;
}

// Reusable double opt-in email capture. Posts to /api/subscribe; the user then
// confirms via a link before they are added to the list. Renders a self-contained
// card with a success state.
export default function EmailCapture({
  topic,
  source,
  variant = 'filing',
  heading,
  description,
}: EmailCaptureProps) {
  const { t, i18n } = useTranslation('subscribe');
  const language: 'ro' | 'en' = i18n.language === 'en' ? 'en' : 'ro';

  const [email, setEmail] = useState('');
  // Honeypot. Hidden from users; bots that fill every field trip it and the
  // server silently drops the submission.
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isValid = /^\S+@\S+\.\S+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting' || !isValid) return;
    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), topic, language, source, website }),
      });

      if (res.ok) {
        setStatus('success');
        setEmail('');
        return;
      }
      if (res.status === 429) {
        setErrorMessage(t('errorRateLimit'));
        setStatus('error');
        return;
      }
      setErrorMessage(t('errorGeneric'));
      setStatus('error');
    } catch {
      setErrorMessage(t('errorNetwork'));
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div
        className="card bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
        role="status"
      >
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-green-700 dark:text-green-400">{t('successTitle')}</p>
            <p className="text-sm text-green-600 dark:text-green-500 mt-1">{t('successDetail')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
          <Mail className="w-5 h-5 text-accent dark:text-accent-light" />
        </div>
        <div>
          <h3 className="font-semibold">{heading ?? t(`${variant}.heading`)}</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
            {description ?? t(`${variant}.description`)}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2" noValidate>
        {status === 'error' && errorMessage && (
          <div
            className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            inputMode="email"
            className="input flex-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            aria-label={t('emailPlaceholder')}
            maxLength={254}
            autoComplete="email"
          />
          {/* Honeypot: off-screen, not tabbable, not announced. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
          />
          <button
            type="submit"
            disabled={!isValid || status === 'submitting'}
            className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {status === 'submitting' ? t('submitting') : t('submit')}
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-slate-400">
          {t('consent')}{' '}
          <Link to="/privacy" className="underline hover:no-underline">
            {t('consentLink')}
          </Link>
        </p>
      </form>
    </div>
  );
}
