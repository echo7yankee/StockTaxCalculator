import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCountry } from '../contexts/CountryContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth, ApiError } from '../contexts/AuthContext';
import { Download, Trash2, AlertTriangle, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PasswordInput from '../components/common/PasswordInput';
import { isCommonPassword } from '../components/common/PasswordStrengthMeter';
import FormField from '../components/common/FormField';
import PageMeta from '../components/common/PageMeta';

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

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string>>({});

  const validateNewPassword = useCallback((value: string) => {
    if (!value) return t('changePassword.tooShort');
    if (value.length < 8) return t('changePassword.tooShort');
    if (isCommonPassword(value)) return t('common:validation.commonPassword');
    return '';
  }, [t]);

  const validateConfirmPassword = useCallback((value: string) => {
    if (!value) return t('changePassword.mismatch');
    if (value !== newPassword) return t('changePassword.mismatch');
    return '';
  }, [t, newPassword]);

  const handlePasswordBlur = (field: string, validator: (v: string) => string, value: string) => {
    const err = validator(value);
    setPasswordFieldErrors(prev => {
      if (err) return { ...prev, [field]: err };
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  };

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordFieldErrors({});

    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = t('changePassword.currentPasswordPlaceholder');
    const newErr = validateNewPassword(newPassword);
    if (newErr) errors.newPassword = newErr;
    const confirmErr = validateConfirmPassword(confirmNewPassword);
    if (confirmErr) errors.confirmNewPassword = confirmErr;

    if (Object.keys(errors).length > 0) {
      setPasswordFieldErrors(errors);
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fields) setPasswordFieldErrors(data.fields);
        throw new ApiError(data.error || t('changePassword.error'), data.fields);
      }
      setPasswordSuccess(t('changePassword.success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      if (!passwordFieldErrors.currentPassword) {
        setPasswordError(err instanceof Error ? err.message : t('changePassword.error'));
      }
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <PageMeta titleKey="settingsTitle" descriptionKey="settingsDesc" />
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>

      <div className="space-y-6">
        {/* Country */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">{t('countryRegion')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
            {t('countryDescription')}
          </p>
          <select
            id="settings-country"
            value={countryCode}
            onChange={e => setCountryCode(e.target.value)}
            className="input"
            aria-label={t('countryRegion')}
          >
            {supportedCountries.map(c => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">{t('moreComing')}</p>
        </div>

        {/* Language */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">{t('language')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
            {t('languageDescription')}
          </p>
          <select
            id="settings-language"
            value={i18n.language.startsWith('ro') ? 'ro' : 'en'}
            onChange={e => i18n.changeLanguage(e.target.value)}
            className="input"
            aria-label={t('language')}
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

        {/* Change Password */}
        {user && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              {t('changePassword.title')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              {t('changePassword.description')}
            </p>

            {passwordSuccess && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg" role="status">
                <p className="text-sm text-green-600 dark:text-green-400">{passwordSuccess}</p>
              </div>
            )}
            {passwordError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg" role="alert">
                <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4" noValidate>
              <PasswordInput
                id="settings-current-password"
                label={t('changePassword.currentPassword')}
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={t('changePassword.currentPasswordPlaceholder')}
                autoComplete="current-password"
                required
                error={passwordFieldErrors.currentPassword}
              />

              <PasswordInput
                id="settings-new-password"
                label={t('changePassword.newPassword')}
                value={newPassword}
                onChange={(v) => { setNewPassword(v); if (passwordFieldErrors.newPassword) handlePasswordBlur('newPassword', validateNewPassword, v); }}
                onBlur={() => handlePasswordBlur('newPassword', validateNewPassword, newPassword)}
                placeholder={t('changePassword.newPasswordPlaceholder')}
                autoComplete="new-password"
                required
                minLength={8}
                showStrength
                error={passwordFieldErrors.newPassword}
              />

              <PasswordInput
                id="settings-confirm-password"
                label={t('changePassword.confirmPassword')}
                value={confirmNewPassword}
                onChange={(v) => { setConfirmNewPassword(v); if (passwordFieldErrors.confirmNewPassword) handlePasswordBlur('confirmNewPassword', validateConfirmPassword, v); }}
                onBlur={() => handlePasswordBlur('confirmNewPassword', validateConfirmPassword, confirmNewPassword)}
                placeholder={t('changePassword.confirmPasswordPlaceholder')}
                autoComplete="new-password"
                required
                minLength={8}
                error={passwordFieldErrors.confirmNewPassword}
              />

              <button type="submit" disabled={changingPassword} className="btn-primary py-2.5">
                {changingPassword ? t('changePassword.changing') : t('changePassword.submit')}
              </button>
            </form>
          </div>
        )}

        {/* Data Export */}
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
              <p className="text-sm text-red-500 mt-2" role="alert">{exportError}</p>
            )}
          </div>
        )}

        {/* Danger Zone */}
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
                <FormField
                  id="delete-confirm"
                  label=""
                  required
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={deleteInput}
                      onChange={e => setDeleteInput(e.target.value)}
                      placeholder={t('dangerZone.confirmPlaceholder')}
                      className="input mb-4 text-base"
                      autoComplete="off"
                    />
                  )}
                </FormField>
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
                  <p className="text-sm text-red-500 mt-3" role="alert">{deleteError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
