import { renderToString } from 'react-dom/server';
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom';
import GhidTrading212Page from './pages/GhidTrading212Page';
import GhidRevolutPage from './pages/GhidRevolutPage';
import GhidCassPage from './pages/GhidCassPage';
import GhidDividendePage from './pages/GhidDividendePage';
import GhidDeclaratieUnicaPage from './pages/GhidDeclaratieUnicaPage';
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
import './index.css';

interface PageConfig {
  component: (() => React.JSX.Element) | null;
  title: string;
  description: string;
  canonicalUrl: string;
  schemas: object[];
  ogType: 'website' | 'article';
}

const HOMEPAGE_META = {
  title: 'InvesTax | Calculator taxe investitii Romania',
  description:
    'Calculeaza impozitul pe investitii Trading212 pentru anul fiscal 2025. Castiguri de capital, dividende, CASS. Deadline 25 mai 2026.',
  url: 'https://investax.app/',
};

const PRERENDER_PAGES: Record<string, PageConfig> = {
  '/': {
    component: null,
    title: HOMEPAGE_META.title,
    description: HOMEPAGE_META.description,
    canonicalUrl: HOMEPAGE_META.url,
    schemas: [],
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
          <Component />
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
