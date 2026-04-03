import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// EN
import enCommon from './locales/en/common.json';
import enLanding from './locales/en/landing.json';
import enCalculator from './locales/en/calculator.json';
import enDashboard from './locales/en/dashboard.json';
import enUpload from './locales/en/upload.json';
import enResults from './locales/en/results.json';
import enFiling from './locales/en/filing.json';
import enLogin from './locales/en/login.json';
import enSignup from './locales/en/signup.json';
import enSettings from './locales/en/settings.json';
import enHeader from './locales/en/header.json';
import enFooter from './locales/en/footer.json';
import enD212 from './locales/en/d212.json';

// RO
import roCommon from './locales/ro/common.json';
import roLanding from './locales/ro/landing.json';
import roCalculator from './locales/ro/calculator.json';
import roDashboard from './locales/ro/dashboard.json';
import roUpload from './locales/ro/upload.json';
import roResults from './locales/ro/results.json';
import roFiling from './locales/ro/filing.json';
import roLogin from './locales/ro/login.json';
import roSignup from './locales/ro/signup.json';
import roSettings from './locales/ro/settings.json';
import roHeader from './locales/ro/header.json';
import roFooter from './locales/ro/footer.json';
import roD212 from './locales/ro/d212.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
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
      ro: {
        common: roCommon,
        landing: roLanding,
        calculator: roCalculator,
        dashboard: roDashboard,
        upload: roUpload,
        results: roResults,
        filing: roFiling,
        login: roLogin,
        signup: roSignup,
        settings: roSettings,
        header: roHeader,
        footer: roFooter,
        d212: roD212,
      },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
