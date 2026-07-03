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
import PricingPage from '../PricingPage';

beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderPricingSsr(url = '/pricing') {
  return renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <PricingPage />
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </StaticRouter>
    </HelmetProvider>,
  );
}

describe('PricingPage prerender (SSR)', () => {
  it('renders to a non-empty HTML string without throwing on browser globals', () => {
    const html = renderPricingSsr();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('<h1');
  });

  it('emits the hero copy and both tier names (RO fallback)', () => {
    const html = renderPricingSsr();
    expect(html).toContain('Calculează-ți taxele Trading212 în 2 minute');
    expect(html).toContain('Gratuit');
    expect(html).toContain('Acces complet');
  });

  it('emits a skeleton placeholder for the promo badge (useEffect fetch unresolved during SSR)', () => {
    const html = renderPricingSsr();
    expect(html).toContain('data-testid="promo-badge-skeleton"');
    expect(html).not.toContain('data-testid="promo-badge"');
  });

  it('emits the unauthenticated checkout CTA (no user during SSR)', () => {
    const html = renderPricingSsr();
    expect(html).toContain('Autentifică-te pentru a cumpăra');
  });

  it('emits the free-tier link to /calculator', () => {
    const html = renderPricingSsr();
    expect(html).toMatch(/href="\/calculator\/"/);
  });

  it('emits the notificare / prior-year offer block with the accountant price anchor (RO)', () => {
    const html = renderPricingSsr();
    expect(html).toContain('Ai primit o notificare de conformare de la ANAF?');
    expect(html).toContain('400-600 lei');
    // Crawlable CTAs to the guide + the free checker.
    expect(html).toMatch(/href="\/ghid\/notificare-anaf-venituri-strainatate\/"/);
    expect(html).toMatch(/href="\/verifica-extras"/);
    // The prior-year offer copy must never carry the dormant 2026 16% rate.
    // Scope the guard to the offer block: the FAQ a8 answer legitimately cites 16%
    // for tax year 2026, so a whole-page assertion would be wrong. (FAQ answers are
    // collapsed during SSR anyway, but scoping keeps the intent precise.)
    const offerStart = html.indexOf('Ai primit o notificare de conformare de la ANAF?');
    const offerBlock = html.slice(offerStart, offerStart + 1200);
    expect(offerBlock).not.toContain('16%');
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });
});
