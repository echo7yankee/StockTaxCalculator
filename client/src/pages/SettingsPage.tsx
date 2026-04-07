import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCountry } from '../contexts/CountryContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Download, Trash2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const { t, i18n } = useTranslation('settings');
  const { countryCode, setCountryCode, supportedCountries } = useCountry();
  const { theme, toggleTheme } = useTheme();
  const { user, deleteAccount, exportData } = useAuth();
  const navigate = useNavigate();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      await exportData();
    } catch {
      setExportError(t('data.exportError'));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteInput !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
      navigate('/');
    } catch {
      setDeleteError(t('dangerZone.deleteError'));
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>

      <div className="space-y-6">
        {/* Country */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">{t('countryRegion')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
            {t('countryDescription')}
          </p>
          <select
            value={countryCode}
            onChange={e => setCountryCode(e.target.value)}
            className="input"
          >
            {supportedCountries.map(c => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 dark:text-slate-600 mt-2">{t('moreComing')}</p>
        </div>

        {/* Language */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">{t('language')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
            {t('languageDescription')}
          </p>
          <select
            value={i18n.language.startsWith('ro') ? 'ro' : 'en'}
            onChange={e => i18n.changeLanguage(e.target.value)}
            className="input"
          >
            <option value="en">English</option>
            <option value="ro">Română</option>
          </select>
        </div>

        {/* Theme */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">{t('appearance')}</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('theme')}</p>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {t('currentTheme', { mode: theme === 'dark' ? 'dark' : 'light' })}
              </p>
            </div>
            <button onClick={toggleTheme} className="btn-secondary">
              {theme === 'dark' ? t('switchToLight') : t('switchToDark')}
            </button>
          </div>
        </div>

        {/* Data Export — only show when logged in */}
        {user && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Download className="w-5 h-5" />
              {t('data.title')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              {t('data.exportDescription')}
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? t('data.exporting') : t('data.exportButton')}
            </button>
            {exportError && (
              <p className="text-sm text-red-500 mt-2">{exportError}</p>
            )}
          </div>
        )}

        {/* Danger Zone — only show when logged in */}
        {user && (
          <div className="card border-red-300 dark:border-red-900">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              {t('dangerZone.title')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              {t('dangerZone.deleteDescription')}
            </p>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {t('dangerZone.deleteButton')}
              </button>
            ) : (
              <div className="border border-red-200 dark:border-red-900 rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
                <p className="font-semibold text-red-700 dark:text-red-400 mb-2">
                  {t('dangerZone.confirmTitle')}
                </p>
                <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                  {t('dangerZone.confirmDescription')}
                </p>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={e => setDeleteInput(e.target.value)}
                  placeholder={t('dangerZone.confirmPlaceholder')}
                  className="input mb-4 text-base"
                  autoComplete="off"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleteInput !== 'DELETE' || deleting}
                    className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleting ? t('dangerZone.deleting') : t('dangerZone.confirmButton')}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteError(''); }}
                    className="btn-secondary"
                  >
                    {t('dangerZone.cancel')}
                  </button>
                </div>
                {deleteError && (
                  <p className="text-sm text-red-500 mt-3">{deleteError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
