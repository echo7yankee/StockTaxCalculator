import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation('footer');

  return (
    <footer className="border-t border-gray-200 dark:border-navy-500 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-slate-500">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <p>{t('tagline')}</p>
        </div>
      </div>
    </footer>
  );
}
