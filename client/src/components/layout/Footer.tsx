import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function Footer() {
  const { t } = useTranslation('footer');

  return (
    <footer className="border-t border-gray-200 dark:border-navy-500 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Disclaimer */}
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-2 leading-relaxed">
          {t('disclaimer')}
        </p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-6 leading-relaxed">
          {t('disclaimerTaxYear')}
        </p>

        {/* Links + Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-slate-400">
          <p data-testid="current-year">{t('copyright', { year: new Date().getFullYear() })}</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-accent dark:hover:text-accent-light transition-colors">
              {t('links.privacy')}
            </Link>
            <Link to="/terms" className="hover:text-accent dark:hover:text-accent-light transition-colors">
              {t('links.terms')}
            </Link>
            <Link to="/contact" className="hover:text-accent dark:hover:text-accent-light transition-colors">
              {t('links.contact')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
