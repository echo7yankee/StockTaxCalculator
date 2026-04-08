import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import PageMeta from '../components/common/PageMeta';

export default function TermsPage() {
  const { t } = useTranslation('terms');

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <PageMeta titleKey="termsTitle" descriptionKey="termsDesc" />
      <div className="flex items-center gap-3 mb-2">
        <FileText className="w-8 h-8 text-accent" />
        <h1 className="text-3xl font-bold">{t('title')}</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">{t('lastUpdated')}</p>
      <p className="text-gray-600 dark:text-slate-400 mb-8">{t('intro')}</p>

      <div className="space-y-8">
        {/* 1. Service Description */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.service.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.service.description')}</p>
        </section>

        {/* 2. Not Financial Advice */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.noAdvice.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.noAdvice.description')}</p>
        </section>

        {/* 3. Accuracy */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.accuracy.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.accuracy.description')}</p>
        </section>

        {/* 4. User Accounts */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.accounts.title')}</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-400">
            <li>{t('sections.accounts.items.age')}</li>
            <li>{t('sections.accounts.items.accurate')}</li>
            <li>{t('sections.accounts.items.security')}</li>
            <li>{t('sections.accounts.items.oneAccount')}</li>
          </ul>
        </section>

        {/* 5. Payment */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.payment.title')}</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-400">
            <li>{t('sections.payment.items.pricing')}</li>
            <li>{t('sections.payment.items.annual')}</li>
            <li>{t('sections.payment.items.refund')}</li>
            <li>{t('sections.payment.items.processor')}</li>
          </ul>
        </section>

        {/* 6. Your Data */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.data.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.data.description')}</p>
        </section>

        {/* 7. Prohibited Uses */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.prohibited.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-3">{t('sections.prohibited.description')}</p>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-400">
            <li>{t('sections.prohibited.items.abuse')}</li>
            <li>{t('sections.prohibited.items.reverse')}</li>
            <li>{t('sections.prohibited.items.overload')}</li>
            <li>{t('sections.prohibited.items.scrape')}</li>
            <li>{t('sections.prohibited.items.share')}</li>
          </ul>
        </section>

        {/* 8. Liability */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.liability.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.liability.description')}</p>
        </section>

        {/* 9. Termination */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.termination.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.termination.description')}</p>
        </section>

        {/* 10. Changes */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.changes.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.changes.description')}</p>
        </section>

        {/* 11. Governing Law */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.law.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.law.description')}</p>
        </section>

        {/* 12. Contact */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.contactUs.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.contactUs.description')}</p>
          <a
            href={`mailto:${t('sections.contactUs.email')}`}
            className="text-accent hover:underline font-medium"
          >
            {t('sections.contactUs.email')}
          </a>
        </section>
      </div>
    </div>
  );
}
