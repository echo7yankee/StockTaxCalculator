import { useCountry } from '../contexts/CountryContext';
import { useTheme } from '../contexts/ThemeContext';

export default function SettingsPage() {
  const { countryCode, setCountryCode, supportedCountries } = useCountry();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="space-y-6">
        {/* Country */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Country / Region</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
            Tax rules and rates are specific to your country. Auto-detected from your browser locale.
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
          <p className="text-xs text-gray-400 dark:text-slate-600 mt-2">More countries coming soon.</p>
        </div>

        {/* Theme */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Theme</p>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Currently using {theme === 'dark' ? 'dark' : 'light'} mode
              </p>
            </div>
            <button onClick={toggleTheme} className="btn-secondary">
              Switch to {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
