// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import { renderToString } from 'react-dom/server';
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import '../../../i18n/i18n';
import PageMeta from '../PageMeta';

// Production prerender emits RO. Flip to RO so the rendered meta reflects the
// build output (the shared test setup forces 'en' for jsdom suites).
beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderMeta(descriptionVars?: Record<string, unknown>): HelmetServerState | undefined {
  const context: { helmet?: HelmetServerState } = {};
  renderToString(
    <HelmetProvider context={context}>
      <PageMeta titleKey="landingTitle" descriptionKey="landingDesc" descriptionVars={descriptionVars} />
    </HelmetProvider>,
  );
  return context.helmet;
}

describe('PageMeta descriptionVars', () => {
  it('forwards interpolation vars into the description meta (no raw placeholders)', () => {
    const meta = renderMeta({ taxYear: 2025, filingDeadline: '25 mai 2026' })?.meta.toString() ?? '';
    expect(meta).toContain('Declarația Unică 2025');
    expect(meta).toContain('Termen 25 mai 2026');
    expect(meta).not.toContain('{{');
  });

  it('year-scopes the English landing meta (both taxYear and filingDeadline slots exist)', async () => {
    await i18n.changeLanguage('en');
    try {
      const meta = renderMeta({ taxYear: 2025, filingDeadline: 'May 25, 2026' })?.meta.toString() ?? '';
      // The EN landingDesc must carry the year-scoping the RO one does (was a
      // silent SEO gap: the slot was missing, so descriptionVars had nothing
      // to fill and the snippet dropped the tax year entirely).
      expect(meta).toContain('tax year 2025');
      expect(meta).toContain('May 25, 2026');
      expect(meta).not.toContain('{{');
    } finally {
      await i18n.changeLanguage('ro');
    }
  });
});

describe('PageMeta robots directive', () => {
  function renderRobotsMeta(robots?: string): string {
    const context: { helmet?: HelmetServerState } = {};
    renderToString(
      <HelmetProvider context={context}>
        <PageMeta titleKey="landingTitle" descriptionKey="landingDesc" robots={robots} />
      </HelmetProvider>,
    );
    return context.helmet?.meta.toString() ?? '';
  }

  it('emits a robots meta when the prop is set (SPA-only app pages)', () => {
    const meta = renderRobotsMeta('noindex, follow');
    expect(meta).toContain('name="robots"');
    expect(meta).toContain('content="noindex, follow"');
  });

  it('omits the robots meta on indexable pages (prop not set)', () => {
    expect(renderRobotsMeta()).not.toContain('name="robots"');
  });
});
