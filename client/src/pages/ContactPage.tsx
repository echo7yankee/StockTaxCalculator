import { useTranslation } from 'react-i18next';
import { Mail, HelpCircle, MessageCircle, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { useState } from 'react';
import PageMeta from '../components/common/PageMeta';

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
  const { t } = useTranslation('contact');

  const faqKeys = ['noEmail', 'wrongCalc', 'refund', 'deleteAccount', 'mobileApp'] as const;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <PageMeta titleKey="contactTitle" descriptionKey="contactDesc" />
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold mb-3">{t('title')}</h1>
        <p className="text-gray-600 dark:text-slate-400 text-lg">{t('subtitle')}</p>
      </div>

      {/* Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
        {/* Support Card */}
        <div className="card flex flex-col items-center text-center p-8">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
            <HelpCircle className="w-6 h-6 text-accent" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{t('support.title')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{t('support.description')}</p>
          <a
            href={`mailto:${t('support.email')}`}
            className="btn-primary inline-flex items-center gap-2 text-sm"
          >
            <Mail className="w-4 h-4" />
            {t('support.email')}
          </a>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">{t('support.responseTime')}</p>
        </div>

        {/* General Card */}
        <div className="card flex flex-col items-center text-center p-8">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
            <MessageCircle className="w-6 h-6 text-accent" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{t('general.title')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{t('general.description')}</p>
          <a
            href={`mailto:${t('general.email')}`}
            className="btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <Mail className="w-4 h-4" />
            {t('general.email')}
          </a>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">{t('general.responseTime')}</p>
        </div>
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
          <p className="flex items-center gap-2">
            <Mail className="w-4 h-4 flex-shrink-0" />
            <a href={`mailto:${t('business.email')}`} className="text-accent hover:underline">
              {t('business.email')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
