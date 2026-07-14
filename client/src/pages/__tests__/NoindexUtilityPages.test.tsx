// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import '../../i18n/i18n';
import NotFoundPage from '../NotFoundPage';
import StatusPage from '../StatusPage';

// Production prerender emits RO; align the test with build output.
beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function robotsMetaOf(node: React.ReactElement): string {
  const context: { helmet?: HelmetServerState } = {};
  renderToString(
    <HelmetProvider context={context}>
      <StaticRouter location="/">{node}</StaticRouter>
    </HelmetProvider>,
  );
  return context.helmet?.meta.toString() ?? '';
}

// Both routes are SPA-only (not prerendered, not in sitemap.xml). The 404 page is
// served at HTTP 200 for any unknown URL (SPA fallback) so without a robots
// directive Google indexes junk URLs as soft-404s; /status is a dev-facing
// internal page. Both must carry noindex so they don't dilute crawl budget.
describe('utility pages are noindex', () => {
  it('NotFoundPage emits noindex (prevents soft-404 indexing of unknown URLs)', () => {
    const meta = robotsMetaOf(<NotFoundPage />);
    expect(meta).toContain('name="robots"');
    expect(meta).toContain('content="noindex, follow"');
  });

  it('StatusPage emits noindex (internal dev-facing status page)', () => {
    const meta = robotsMetaOf(<StatusPage />);
    expect(meta).toContain('name="robots"');
    expect(meta).toContain('content="noindex, follow"');
  });
});
