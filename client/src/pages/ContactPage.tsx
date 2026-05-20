import { useTranslation } from 'react-i18next';
import { HelpCircle, MessageCircle, ChevronDown, ChevronUp, MapPin, Send, Check, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import PageMeta from '../components/common/PageMeta';

type Topic = 'support' | 'general' | 'business';
type Status = 'idle' | 'submitting' | 'success' | 'error';

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-navy-500 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left font-medium hover:bg-gray-50 dark:hover:bg-navy-700 rounded-lg transition-colors"
      >
        <span>{question}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0 ml-2" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0 ml-2" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 text-gray-600 dark:text-slate-400">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function ContactPage() {
  const { t, i18n } = useTranslation('contact');
  const faqKeys = ['noEmail', 'wrongCalc', 'refund', 'deleteAccount', 'mobileApp'] as const;
  const language = (i18n.language === 'en' ? 'en' : 'ro') as 'ro' | 'en';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<Topic>('support');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [fieldError, setFieldError] = useState<string>('');

  const isFormValid =
    name.trim().length >= 1 &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    message.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrorMessage('');
    setFieldError('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          topic,
          message: message.trim(),
          language,
        }),
      });

      if (res.ok) {
        setStatus('success');
        setName('');
        setEmail('');
        setMessage('');
        setTopic('support');
        return;
      }

      if (res.status === 429) {
        setErrorMessage(t('form.errorRateLimit'));
        setStatus('error');
        return;
      }

      const body = await res.json().catch(() => null);
      if (body?.field) setFieldError(body.field);
      setErrorMessage(t('form.errorGeneric'));
      setStatus('error');
    } catch {
      setErrorMessage(t('form.errorNetwork'));
      setStatus('error');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <PageMeta titleKey="contactTitle" descriptionKey="contactDesc" />
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold mb-3">{t('title')}</h1>
        <p className="text-gray-600 dark:text-slate-400 text-lg">{t('subtitle')}</p>
      </div>

      {/* Contact channel cards (informational only — submission happens via the form below) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
        <div className="card flex flex-col items-center text-center p-8">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
            <HelpCircle className="w-6 h-6 text-accent dark:text-accent-light" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{t('support.title')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{t('support.description')}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">{t('support.responseTime')}</p>
        </div>

        <div className="card flex flex-col items-center text-center p-8">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
            <MessageCircle className="w-6 h-6 text-accent dark:text-accent-light" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{t('general.title')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{t('general.description')}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">{t('general.responseTime')}</p>
        </div>
      </div>

      {/* Contact form */}
      <div className="card mb-12">
        <h2 className="text-xl font-bold mb-2">{t('form.heading')}</h2>
        <p className="text-sm text-gray-600 dark:text-slate-400 mb-6">{t('form.subheading')}</p>

        {status === 'success' ? (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg" role="status">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">{t('form.successTitle')}</p>
                <p className="text-sm text-green-600 dark:text-green-500 mt-1">{t('form.successDetail')}</p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="text-sm text-green-700 dark:text-green-400 underline mt-2"
                >
                  {t('form.sendAnother')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {status === 'error' && errorMessage && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2" role="alert">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
              </div>
            )}

            <div>
              <label htmlFor="contact-name" className="block text-sm font-medium mb-1.5">{t('form.name')}</label>
              <input
                id="contact-name"
                type="text"
                className={`input ${fieldError === 'name' ? 'border-red-500' : ''}`}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('form.namePlaceholder')}
                maxLength={100}
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium mb-1.5">{t('form.email')}</label>
              <input
                id="contact-email"
                type="email"
                inputMode="email"
                className={`input ${fieldError === 'email' ? 'border-red-500' : ''}`}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('form.emailPlaceholder')}
                maxLength={254}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="contact-topic" className="block text-sm font-medium mb-1.5">{t('form.topic')}</label>
              <select
                id="contact-topic"
                className="input"
                value={topic}
                onChange={e => setTopic(e.target.value as Topic)}
              >
                <option value="support">{t('form.topicSupport')}</option>
                <option value="general">{t('form.topicGeneral')}</option>
                <option value="business">{t('form.topicBusiness')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="contact-message" className="block text-sm font-medium mb-1.5">{t('form.message')}</label>
              <textarea
                id="contact-message"
                className={`input min-h-[150px] ${fieldError === 'message' ? 'border-red-500' : ''}`}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t('form.messagePlaceholder')}
                maxLength={5000}
                rows={6}
                required
              />
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{t('form.messageHint', { count: message.trim().length, max: 5000 })}</p>
            </div>

            <button
              type="submit"
              disabled={!isFormValid || status === 'submitting'}
              className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
            >
              {status === 'submitting' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('form.sending')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {t('form.submit')}
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* FAQ */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6">{t('faq.title')}</h2>
        <div className="space-y-3">
          {faqKeys.map((key) => (
            <FaqItem
              key={key}
              question={t(`faq.items.${key}.question`)}
              answer={t(`faq.items.${key}.answer`)}
            />
          ))}
        </div>
      </div>

      {/* Business Info */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          {t('business.title')}
        </h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-slate-400">
          <p>{t('business.operator')}</p>
          <p className="flex items-center gap-2">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            {t('business.address')}
          </p>
        </div>
      </div>
    </div>
  );
}
