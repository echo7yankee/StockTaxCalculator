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
import GhidNotificareAnafPage from '../GhidNotificareAnafPage';

beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderSsr(url = '/ghid/notificare-anaf-venituri-strainatate') {
  return renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <GhidNotificareAnafPage />
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </StaticRouter>
    </HelmetProvider>,
  );
}

describe('GhidNotificareAnafPage prerender (SSR)', () => {
  it('renders to a non-empty HTML string without throwing on browser globals', () => {
    const html = renderSsr();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('<h1');
  });

  it('emits the H1 headline targeting the notificare query', () => {
    const html = renderSsr();
    expect(html).toContain('Notificare de la ANAF pentru venituri din');
  });

  it('emits the notificare procedure core (30 days, email response channel, rectificativa)', () => {
    const html = renderSsr();
    expect(html).toContain('30 de zile');
    expect(html).toContain('Notificare.VSFP@anaf.ro');
    expect(html).toContain('rectificativ');
    expect(html).toContain('art. 140^1');
  });

  it('carries the per-year facts: 8% dividends, 10% capital gains, both CASS threshold sets', () => {
    const html = renderSsr();
    expect(html).toContain('8%');
    expect(html).toContain('10%');
    expect(html).toContain('18.000 / 36.000 / 72.000');
    expect(html).toContain('19.800 / 39.600 / 79.200');
    expect(html).toContain('27 mai 2024');
    expect(html).toContain('26 mai 2025');
  });

  it('never leaks the dormant 2026 16% rate onto the prior-year page', () => {
    const html = renderSsr();
    expect(html).not.toContain('16%');
  });

  it('cross-links the cluster with crawlable anchors (related guides + hub)', () => {
    const html = renderSsr();
    expect(html).toMatch(/href="\/ghid\/cum-completez-declaratia-unica"/);
    expect(html).toMatch(/href="\/ghid\/declaratie-unica-trading212"/);
    expect(html).toMatch(/href="\/ghid"/);
  });

  it('emits FAQ questions used by the FAQPage schema', () => {
    const html = renderSsr();
    expect(html).toContain('Ce este o notificare de conformare');
    expect(html).toContain('Depun rectificativ');
  });

  it('server-renders the prior_years waitlist capture (visible to crawlers / no-JS)', () => {
    const html = renderSsr();
    expect(html).toContain('Vrei calcul automat pentru anii 2023');
    expect(html).toContain('cererea reală');
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });
});
