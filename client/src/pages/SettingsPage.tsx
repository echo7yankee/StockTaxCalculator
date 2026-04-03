import { useTranslation } from 'react-i18next';
import { useCountry } from '../contexts/CountryContext';
import { useTheme } from '../contexts/ThemeContext';

export default function SettingsPage() {
  const { t, i18n } = useTranslation('settings');
  const { countryCode, setCountryCode, supportedCountries } = useCountry();
  const { theme, toggleTheme } = useTheme();

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
      </div>
    </div>
  );
}
