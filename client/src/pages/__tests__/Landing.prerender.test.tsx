// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom';
import '../../i18n/i18n';
import { AuthProvider } from '../../contexts/AuthContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { CountryProvider } from '../../contexts/CountryContext';
import { UploadProvider } from '../../contexts/UploadContext';
import Landing from '../Landing';

// Production prerender emits RO (i18n.ts: fallbackLng 'ro', no LanguageDetector
// outside the browser). The shared test setup forces `lng: 'en'` for all other
// suites, so flip to RO here so this SSR test reflects what the build actually
// writes into dist/index.html.
beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderLandingSsr(url = '/') {
  return renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <Landing />
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </StaticRouter>
    </HelmetProvider>,
  );
}

describe('Landing prerender (SSR)', () => {
  it('renders to a non-empty HTML string without throwing on browser globals', () => {
    const html = renderLandingSsr();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('<h1');
  });

  it('emits the ChatGPT-validated positioning phrasings (RO fallback)', () => {
    const html = renderLandingSsr();
    expect(html).toContain('Trading 212');
    expect(html).toContain('Revolut');
    expect(html).toContain('IBKR');
    expect(html).toContain('investitor pasiv');
    expect(html).toContain('buy &amp; hold');
    expect(html).toContain('dividende externe');
  });

  it('emits the verified tax-method specifics (CMP, W-8BEN, CASS)', () => {
    const html = renderLandingSsr();
    expect(html).toContain('CMP');
    expect(html).toContain('W-8BEN');
    expect(html).toContain('CASS');
  });

  it('resolves year-dynamic copy to the engine-supported tax year (no raw placeholders)', () => {
    // heroSubtitle + trustTaxLawDesc read {{taxYear}} from getCurrentTaxYearConfig.
    // Today the engineSupported fallback resolves to 2025, byte-identical to the
    // previously hardcoded copy. Backlog item #17 PR 2.
    const html = renderLandingSsr();
    expect(html).toContain('cifrele D212 pentru 2025');
    expect(html).toContain('pentru anul 2025');
    expect(html).not.toContain('{{');
  });

  it('emits the primary calls-to-action (calculator + statement checker)', () => {
    const html = renderLandingSsr();
    expect(html).toMatch(/href="\/calculator\/"/);
    // Pre-pay parse gate (backlog #24B Phase 2, PR-3): the anonymous SSR render (the
    // prerendered homepage is always anonymous) routes the primary "get started" CTA
    // through the FREE checker (/verifica-extras) instead of straight to the paywall.
    // A paid user (client-side only) still gets /upload.
    expect(html).toMatch(/href="\/verifica-extras"/);
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });
});
