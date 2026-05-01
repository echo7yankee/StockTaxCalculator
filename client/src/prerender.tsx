import { renderToString } from 'react-dom/server';
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom';
import GhidTrading212Page from './pages/GhidTrading212Page';
import {
  GHID_T212_ARTICLE_SCHEMA,
  GHID_T212_FAQ_SCHEMA,
  GHID_T212_META,
} from './lib/ghidTrading212Schemas';
import './index.css';

const PRERENDER_PAGES: Record<
  string,
  {
    component: () => React.JSX.Element;
    title: string;
    description: string;
    canonicalUrl: string;
    schemas: object[];
  }
> = {
  '/ghid/declaratie-unica-trading212': {
    component: () => <GhidTrading212Page />,
    title: GHID_T212_META.title,
    description: GHID_T212_META.description,
    canonicalUrl: GHID_T212_META.url,
    schemas: [GHID_T212_ARTICLE_SCHEMA, GHID_T212_FAQ_SCHEMA],
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

  const helmetContext: { helmet?: HelmetServerState } = {};

  const body = renderToString(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={data.url}>
        <page.component />
      </StaticRouter>
    </HelmetProvider>
  );

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
        { type: 'meta', props: { property: 'og:title', content: page.title } },
        { type: 'meta', props: { property: 'og:description', content: page.description } },
        { type: 'meta', props: { property: 'og:url', content: page.canonicalUrl } },
        { type: 'meta', props: { property: 'og:type', content: 'article' } },
      ]),
    },
  };
}
