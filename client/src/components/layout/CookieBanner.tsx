import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cookie, X } from 'lucide-react';

const STORAGE_KEY = 'cookieConsent';

export default function CookieBanner() {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'dismissed');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 pointer-events-none">
      <div className="max-w-lg mx-auto bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-500 rounded-xl shadow-lg p-4 flex items-start gap-3 pointer-events-auto">
        <Cookie className="w-5 h-5 text-accent dark:text-accent-light flex-shrink-0 mt-0.5" />
        <p className="text-sm text-gray-600 dark:text-slate-300 flex-1">
          {t('cookieBanner.message')}
        </p>
        <button
          onClick={dismiss}
          className="flex-shrink-0 bg-accent hover:bg-accent/90 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {t('cookieBanner.accept')}
        </button>
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-gray-500 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
          aria-label={t('cookieBanner.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
