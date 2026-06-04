import { renderToString } from 'react-dom/server';
import { getCurrentTaxYearConfig } from '@shared/taxRules/taxYears';
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom';
import './i18n/i18n';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { CountryProvider } from './contexts/CountryContext';
import { UploadProvider } from './contexts/UploadContext';
import Landing from './pages/Landing';
import PricingPage from './pages/PricingPage';
import CalculatorPage from './pages/CalculatorPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import ContactPage from './pages/ContactPage';
import GhidIndexPage from './pages/GhidIndexPage';
import GhidTrading212Page from './pages/GhidTrading212Page';
import GhidRevolutPage from './pages/GhidRevolutPage';
import GhidIbkrPage from './pages/GhidIbkrPage';
import GhidCassPage from './pages/GhidCassPage';
import GhidDividendePage from './pages/GhidDividendePage';
import GhidDeclaratieUnicaPage from './pages/GhidDeclaratieUnicaPage';
import GhidCumCalculamPage from './pages/GhidCumCalculamPage';
import {
  GHID_INDEX_COLLECTION_SCHEMA,
  GHID_INDEX_META,
} from './lib/ghidIndexSchemas';
import {
  GHID_T212_ARTICLE_SCHEMA,
  GHID_T212_FAQ_SCHEMA,
  GHID_T212_META,
} from './lib/ghidTrading212Schemas';
import {
  GHID_REVOLUT_ARTICLE_SCHEMA,
  GHID_REVOLUT_FAQ_SCHEMA,
  GHID_REVOLUT_META,
} from './lib/ghidRevolutSchemas';
import {
  GHID_IBKR_ARTICLE_SCHEMA,
  GHID_IBKR_FAQ_SCHEMA,
  GHID_IBKR_META,
} from './lib/ghidIbkrSchemas';
import {
  GHID_CASS_ARTICLE_SCHEMA,
  GHID_CASS_FAQ_SCHEMA,
  GHID_CASS_META,
} from './lib/ghidCassSchemas';
import {
  GHID_DIVIDENDE_ARTICLE_SCHEMA,
  GHID_DIVIDENDE_FAQ_SCHEMA,
  GHID_DIVIDENDE_META,
} from './lib/ghidDividendeSchemas';
import {
  GHID_DU_ARTICLE_SCHEMA,
  GHID_DU_FAQ_SCHEMA,
  GHID_DU_META,
} from './lib/ghidDeclaratieUnicaSchemas';
import {
  GHID_CUM_CALCULAM_ARTICLE_SCHEMA,
  GHID_CUM_CALCULAM_FAQ_SCHEMA,
  GHID_CUM_CALCULAM_META,
} from './lib/ghidCumCalculamSchemas';
import './index.css';

interface PageConfig {
  component: (() => React.JSX.Element) | null;
  title: string;
  description: string;
  canonicalUrl: string;
  schemas: object[];
  ogType: 'website' | 'article';
}

// Build-time tax-year config. Mirrors the client-side PageMeta/i18n templating so
// the prerendered static <head> matches the hydrated copy. Backlog item #17.
const taxYearConfig = getCurrentTaxYearConfig();

const HOMEPAGE_META = {
  title: 'InvesTax | Calculator taxe investiții România',
  description: `Declarația Unică ${taxYearConfig.taxYear} pentru investitorii Trading 212, Revolut, IBKR. Câștiguri pe metoda CMP, dividende externe cu credit fiscal (W-8BEN), CASS. Termen ${taxYearConfig.filingDeadlineRo}.`,
  url: 'https://investax.app/',
};

const PRICING_META = {
  title: 'Prețuri | InvesTax',
  description:
    'Încarci extrasul Trading212 și primești un raport fiscal complet, gata de copiat în Declarația Unică. Plată anuală unică.',
  url: 'https://investax.app/pricing/',
};

const CALCULATOR_META = {
  title: 'Calculator taxe gratuit | InvesTax',
  description: `Calculează gratuit impozitul pe câștiguri de capital, dividende și CASS pentru anul fiscal ${taxYearConfig.taxYear}. Fără cont, fără card.`,
  url: 'https://investax.app/calculator/',
};

const PRIVACY_META = {
  title: 'Politica de confidențialitate | InvesTax',
  description: 'Cum gestionează InvesTax datele tale personale. Conform GDPR.',
  url: 'https://investax.app/privacy/',
};

const TERMS_META = {
  title: 'Termeni și condiții | InvesTax',
  description: 'Termenii și condițiile de utilizare a InvesTax.',
  url: 'https://investax.app/terms/',
};

const CONTACT_META = {
  title: 'Contact | InvesTax',
  description: 'Contactează echipa InvesTax. Răspundem în maxim 24 de ore în zilele lucrătoare.',
  url: 'https://investax.app/contact/',
};

const PRERENDER_PAGES: Record<string, PageConfig> = {
  '/': {
    component: () => <Landing />,
    title: HOMEPAGE_META.title,
    description: HOMEPAGE_META.description,
    canonicalUrl: HOMEPAGE_META.url,
    schemas: [],
    ogType: 'website',
  },
  '/pricing': {
    component: () => <PricingPage />,
    title: PRICING_META.title,
    description: PRICING_META.description,
    canonicalUrl: PRICING_META.url,
    schemas: [],
    ogType: 'website',
  },
  '/calculator': {
    component: () => <CalculatorPage />,
    title: CALCULATOR_META.title,
    description: CALCULATOR_META.description,
    canonicalUrl: CALCULATOR_META.url,
    schemas: [],
    ogType: 'website',
  },
  '/privacy': {
    component: () => <PrivacyPage />,
    title: PRIVACY_META.title,
    description: PRIVACY_META.description,
    canonicalUrl: PRIVACY_META.url,
    schemas: [],
    ogType: 'website',
  },
  '/terms': {
    component: () => <TermsPage />,
    title: TERMS_META.title,
    description: TERMS_META.description,
    canonicalUrl: TERMS_META.url,
    schemas: [],
    ogType: 'website',
  },
  '/contact': {
    component: () => <ContactPage />,
    title: CONTACT_META.title,
    description: CONTACT_META.description,
    canonicalUrl: CONTACT_META.url,
    schemas: [],
    ogType: 'website',
  },
  '/ghid': {
    component: () => <GhidIndexPage />,
    title: GHID_INDEX_META.title,
    description: GHID_INDEX_META.description,
    canonicalUrl: GHID_INDEX_META.url,
    schemas: [GHID_INDEX_COLLECTION_SCHEMA],
    ogType: 'website',
  },
  '/ghid/declaratie-unica-trading212': {
    component: () => <GhidTrading212Page />,
    title: GHID_T212_META.title,
    description: GHID_T212_META.description,
    canonicalUrl: GHID_T212_META.url,
    schemas: [GHID_T212_ARTICLE_SCHEMA, GHID_T212_FAQ_SCHEMA],
    ogType: 'article',
  },
  '/ghid/declaratie-unica-revolut': {
    component: () => <GhidRevolutPage />,
    title: GHID_REVOLUT_META.title,
    description: GHID_REVOLUT_META.description,
    canonicalUrl: GHID_REVOLUT_META.url,
    schemas: [GHID_REVOLUT_ARTICLE_SCHEMA, GHID_REVOLUT_FAQ_SCHEMA],
    ogType: 'article',
  },
  '/ghid/declaratie-unica-ibkr': {
    component: () => <GhidIbkrPage />,
    title: GHID_IBKR_META.title,
    description: GHID_IBKR_META.description,
    canonicalUrl: GHID_IBKR_META.url,
    schemas: [GHID_IBKR_ARTICLE_SCHEMA, GHID_IBKR_FAQ_SCHEMA],
    ogType: 'article',
  },
  '/ghid/cass-investitii': {
    component: () => <GhidCassPage />,
    title: GHID_CASS_META.title,
    description: GHID_CASS_META.description,
    canonicalUrl: GHID_CASS_META.url,
    schemas: [GHID_CASS_ARTICLE_SCHEMA, GHID_CASS_FAQ_SCHEMA],
    ogType: 'article',
  },
  '/ghid/dividende-broker-strain': {
    component: () => <GhidDividendePage />,
    title: GHID_DIVIDENDE_META.title,
    description: GHID_DIVIDENDE_META.description,
    canonicalUrl: GHID_DIVIDENDE_META.url,
    schemas: [GHID_DIVIDENDE_ARTICLE_SCHEMA, GHID_DIVIDENDE_FAQ_SCHEMA],
    ogType: 'article',
  },
  '/ghid/cum-completez-declaratia-unica': {
    component: () => <GhidDeclaratieUnicaPage />,
    title: GHID_DU_META.title,
    description: GHID_DU_META.description,
    canonicalUrl: GHID_DU_META.url,
    schemas: [GHID_DU_ARTICLE_SCHEMA, GHID_DU_FAQ_SCHEMA],
    ogType: 'article',
  },
  '/ghid/cum-calculam': {
    component: () => <GhidCumCalculamPage />,
    title: GHID_CUM_CALCULAM_META.title,
    description: GHID_CUM_CALCULAM_META.description,
    canonicalUrl: GHID_CUM_CALCULAM_META.url,
    schemas: [GHID_CUM_CALCULAM_ARTICLE_SCHEMA, GHID_CUM_CALCULAM_FAQ_SCHEMA],
    ogType: 'article',
  },
};

function escapeJsonForScript(value: object): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function prerender(data: { url: string }) {
  const page = PRERENDER_PAGES[data.url];
  if (!page) {
    return { html: '' };
  }

  let body = '';
  if (page.component) {
    const helmetContext: { helmet?: HelmetServerState } = {};
    const Component = page.component;
    body = renderToString(
      <HelmetProvider context={helmetContext}>
        <StaticRouter location={data.url}>
          <AuthProvider>
            <ThemeProvider>
              <CountryProvider>
                <UploadProvider>
                  <Component />
                </UploadProvider>
              </CountryProvider>
            </ThemeProvider>
          </AuthProvider>
        </StaticRouter>
      </HelmetProvider>
    );
  }

  const schemaScripts = page.schemas
    .map((s) => `<script type="application/ld+json">${escapeJsonForScript(s)}</script>`)
    .join('');

  return {
    html: schemaScripts + body,
    head: {
      lang: 'ro',
      title: page.title,
      elements: new Set([
        { type: 'meta', props: { name: 'description', content: page.description } },
        { type: 'link', props: { rel: 'canonical', href: page.canonicalUrl } },
        { type: 'meta', props: { property: 'og:type', content: page.ogType } },
        { type: 'meta', props: { property: 'og:title', content: page.title } },
        { type: 'meta', props: { property: 'og:description', content: page.description } },
        { type: 'meta', props: { property: 'og:url', content: page.canonicalUrl } },
        { type: 'meta', props: { name: 'twitter:title', content: page.title } },
        { type: 'meta', props: { name: 'twitter:description', content: page.description } },
      ]),
    },
  };
}
