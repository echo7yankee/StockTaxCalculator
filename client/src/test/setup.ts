import '@testing-library/jest-dom/vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import all EN translations for tests
import enCommon from '../i18n/locales/en/common.json';
import enLanding from '../i18n/locales/en/landing.json';
import enCalculator from '../i18n/locales/en/calculator.json';
import enDashboard from '../i18n/locales/en/dashboard.json';
import enUpload from '../i18n/locales/en/upload.json';
import enResults from '../i18n/locales/en/results.json';
import enFiling from '../i18n/locales/en/filing.json';
import enLogin from '../i18n/locales/en/login.json';
import enSignup from '../i18n/locales/en/signup.json';
import enSettings from '../i18n/locales/en/settings.json';
import enHeader from '../i18n/locales/en/header.json';
import enFooter from '../i18n/locales/en/footer.json';
import enD212 from '../i18n/locales/en/d212.json';

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  resources: {
    en: {
      common: enCommon,
      landing: enLanding,
      calculator: enCalculator,
      dashboard: enDashboard,
      upload: enUpload,
      results: enResults,
      filing: enFiling,
      login: enLogin,
      signup: enSignup,
      settings: enSettings,
      header: enHeader,
      footer: enFooter,
      d212: enD212,
    },
  },
  interpolation: { escapeValue: false },
});
