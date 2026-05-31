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
import GhidCumCalculamPage from '../GhidCumCalculamPage';

beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderSsr(url = '/ghid/cum-calculam') {
  return renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <GhidCumCalculamPage />
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </StaticRouter>
    </HelmetProvider>,
  );
}

describe('GhidCumCalculamPage prerender (SSR)', () => {
  it('renders to a non-empty HTML string without throwing on browser globals', () => {
    const html = renderSsr();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('<h1');
  });

  it('emits the H1 headline and the methodology subtitle', () => {
    const html = renderSsr();
    expect(html).toContain('Cum calculează InvesTax: metodologia explicată');
    expect(html).toContain('Documentăm exact ce face engine-ul');
  });

  it('emits the verified Codul Fiscal citations used by the engine', () => {
    const html = renderSsr();
    expect(html).toContain('art. 94');
    expect(html).toContain('Norma 18/2023');
    expect(html).toContain('art. 96');
    expect(html).toContain('art. 131');
    expect(html).toContain('art. 119');
    expect(html).toContain('art. 170');
    expect(html).toContain('HG 1506/2024');
  });

  it('emits the CASS bracket numbers for 2025', () => {
    const html = renderSsr();
    expect(html).toContain('24.300');
    expect(html).toContain('48.600');
    expect(html).toContain('97.200');
    expect(html).toContain('2.430');
    expect(html).toContain('4.860');
    expect(html).toContain('9.720');
  });

  it('emits the PDF cap-gains per-date BNR methodology (art. 96) and the historical 28,053 note', () => {
    const html = renderSsr();
    // Both flows now convert capital gains per-trade-date (backlog #21).
    expect(html).toContain('cursul BNR per-tranzacție pentru câștigurile de capital');
    expect(html).toContain('art. 96');
    // Dividends still annual-average.
    expect(html).toContain('cursul mediu anual BNR');
    // Founder filing kept as a historical note, not current methodology.
    expect(html).toContain('Notă istorică');
    expect(html).toContain('28.053 lei');
  });

  it('emits the CMP-vs-FIFO methodology positioning (no FIFO claim)', () => {
    const html = renderSsr();
    expect(html).toContain('CMP');
    expect(html).toContain('Cost Mediu Ponderat');
    expect(html).toContain('FIFO nu este suportat');
  });

  it('cross-links to /ghid/cass-investitii and /ghid/dividende-broker-strain', () => {
    const html = renderSsr();
    expect(html).toMatch(/href="\/ghid\/cass-investitii"/);
    expect(html).toMatch(/href="\/ghid\/dividende-broker-strain"/);
  });

  it('emits the FAQ schema mainEntity questions', () => {
    const html = renderSsr();
    expect(html).toContain('De ce folosiți CMP');
    expect(html).toContain('Ce curs BNR aplicați pentru dividende?');
    expect(html).toContain('Ce NU calculează InvesTax?');
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });
});
