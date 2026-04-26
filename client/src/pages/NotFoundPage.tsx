import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageMeta from '../components/common/PageMeta';

export default function NotFoundPage() {
  const { t } = useTranslation('meta');

  return (
    <>
      <PageMeta titleKey="notFoundTitle" descriptionKey="notFoundDesc" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <p className="text-7xl font-bold text-accent dark:text-accent-light mb-4">404</p>
          <h1 className="text-2xl sm:text-3xl font-bold mb-4">{t('notFoundTitle').replace(' | InvesTax', '')}</h1>
          <p className="text-gray-600 dark:text-slate-400 mb-8 max-w-md mx-auto">
            {t('notFoundDesc')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/" className="btn-primary flex items-center gap-2 px-6 py-3">
              <Home className="w-5 h-5" />
              {t('notFoundHome', 'Back to Home')}
            </Link>
            <button
              onClick={() => window.history.back()}
              className="btn-secondary flex items-center gap-2 px-6 py-3"
            >
              <ArrowLeft className="w-5 h-5" />
              {t('notFoundBack', 'Go Back')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
