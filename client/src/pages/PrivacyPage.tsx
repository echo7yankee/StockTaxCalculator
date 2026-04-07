import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';

export default function PrivacyPage() {
  const { t } = useTranslation('privacy');

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-8 h-8 text-accent" />
        <h1 className="text-3xl font-bold">{t('title')}</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-slate-500 mb-6">{t('lastUpdated')}</p>
      <p className="text-gray-600 dark:text-slate-400 mb-8">{t('intro')}</p>

      <div className="space-y-8">
        {/* 1. Data Collected */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.dataCollected.title')}</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-400">
            <li>{t('sections.dataCollected.items.account')}</li>
            <li>{t('sections.dataCollected.items.calculations')}</li>
            <li>{t('sections.dataCollected.items.usage')}</li>
            <li>{t('sections.dataCollected.items.technical')}</li>
          </ul>
        </section>

        {/* 2. Why We Collect */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.whyCollect.title')}</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-400">
            <li>{t('sections.whyCollect.items.service')}</li>
            <li>{t('sections.whyCollect.items.save')}</li>
            <li>{t('sections.whyCollect.items.improve')}</li>
            <li>{t('sections.whyCollect.items.security')}</li>
          </ul>
        </section>

        {/* 3. Storage */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.storage.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.storage.description')}</p>
        </section>

        {/* 4. Data Sharing */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.sharing.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-3">{t('sections.sharing.description')}</p>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-400">
            <li>{t('sections.sharing.providers.hetzner')}</li>
            <li>{t('sections.sharing.providers.lemonSqueezy')}</li>
            <li>{t('sections.sharing.providers.resend')}</li>
            <li>{t('sections.sharing.providers.plausible')}</li>
          </ul>
        </section>

        {/* 5. Cookies */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.cookies.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.cookies.description')}</p>
        </section>

        {/* 6. GDPR Rights */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.gdprRights.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400 mb-3">{t('sections.gdprRights.description')}</p>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-slate-400">
            <li>{t('sections.gdprRights.rights.access')}</li>
            <li>{t('sections.gdprRights.rights.export')}</li>
            <li>{t('sections.gdprRights.rights.delete')}</li>
            <li>{t('sections.gdprRights.rights.rectify')}</li>
            <li>{t('sections.gdprRights.rights.object')}</li>
          </ul>
          <p className="text-gray-600 dark:text-slate-400 mt-3">{t('sections.gdprRights.contact')}</p>
        </section>

        {/* 7. Retention */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.retention.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.retention.description')}</p>
        </section>

        {/* 8. Children */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.children.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.children.description')}</p>
        </section>

        {/* 9. Changes */}
        <section>
          <h2 className="text-xl font-semibold mb-3">{t('sections.changes.title')}</h2>
          <p className="text-gray-600 dark:text-slate-400">{t('sections.changes.description')}</p>
        </section>

        {/* 10. Contact */}
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
