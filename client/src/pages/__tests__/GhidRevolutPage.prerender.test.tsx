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
import GhidRevolutPage from '../GhidRevolutPage';

beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderSsr(url = '/ghid/declaratie-unica-revolut') {
  return renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <GhidRevolutPage />
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </StaticRouter>
    </HelmetProvider>,
  );
}

describe('GhidRevolutPage prerender (SSR)', () => {
  it('renders to a non-empty HTML string without throwing on browser globals', () => {
    const html = renderSsr();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('<h1');
  });

  it('emits the H1 headline', () => {
    const html = renderSsr();
    expect(html).toContain('Cum declar Revolut Trading');
  });

  it('emits the export-recipe core (Account Statement Excel, All time, not the P&L summary)', () => {
    const html = renderSsr();
    expect(html).toContain('Account Statement');
    expect(html).toContain('Excel');
    expect(html).toContain('All time');
    expect(html).toContain('Get statement');
  });

  it('surfaces the beta verify-before-filing caveat (incl. the dividend over-statement note)', () => {
    const html = renderSsr();
    expect(html).toContain('beta');
    expect(html).toContain('Verifică cifrele înainte să depui');
    // Dividend WHT is not broken out in the current format -> full 10%, over-states (the safe direction).
    expect(html).toContain('supraestimează');
  });

  it('stays scoped to tax year 2025 (10% rate, verified Codul Fiscal citations)', () => {
    const html = renderSsr();
    expect(html).toContain('10%');
    expect(html).toContain('art. 96');
    expect(html).toContain('art. 131');
    // 16% is the dormant 2026 rate (Legea 239/2025), gated behind engineSupported;
    // it must NOT appear on a public 2025-scoped page.
    expect(html).not.toContain('16%');
  });

  it('emits FAQ questions used by the FAQPage schema', () => {
    const html = renderSsr();
    expect(html).toContain('Revolut Trading reține impozitul în România');
    expect(html).toContain('Ce extras de la Revolut citește InvesTax');
  });

  it('server-renders the broker-waitlist email capture (visible to crawlers / no-JS)', () => {
    const html = renderSsr();
    expect(html).toContain('Te anunțăm când Revolut iese din beta');
    expect(html).toContain('Trimite-ni-l anonimizat');
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });
});
