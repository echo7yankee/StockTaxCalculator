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
import enPrivacy from './locales/en/privacy.json';
import enTerms from './locales/en/terms.json';
import enContact from './locales/en/contact.json';
import enPricing from './locales/en/pricing.json';
import enMeta from './locales/en/meta.json';

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
import roPrivacy from './locales/ro/privacy.json';
import roTerms from './locales/ro/terms.json';
import roContact from './locales/ro/contact.json';
import roPricing from './locales/ro/pricing.json';
import roMeta from './locales/ro/meta.json';

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
        privacy: enPrivacy,
        terms: enTerms,
        contact: enContact,
        pricing: enPricing,
        meta: enMeta,
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
        privacy: roPrivacy,
        terms: roTerms,
        contact: roContact,
        pricing: roPricing,
        meta: roMeta,
      },
    },
    // Romania is the launch market; default everyone to Romanian unless
    // they have explicitly switched via Settings (cached in localStorage).
    // navigator detection was removed because Googlebot/crawlers send
    // Accept-Language: en, which caused investax.app to be indexed with
    // English meta on Google.ro searches.
    fallbackLng: 'ro',
    defaultNS: 'common',
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
