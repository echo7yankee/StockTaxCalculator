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
import GhidXtbPage from '../GhidXtbPage';

beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderSsr(url = '/ghid/impozit-xtb') {
  return renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <GhidXtbPage />
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </StaticRouter>
    </HelmetProvider>,
  );
}

describe('GhidXtbPage prerender (SSR)', () => {
  it('renders to a non-empty HTML string without throwing on browser globals', () => {
    const html = renderSsr();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('<h1');
  });

  it('emits the H1 headline targeting the XTB impozit query', () => {
    const html = renderSsr();
    expect(html).toContain('Impozit pe investiții la XTB');
  });

  it('states the core XTB regime: resident branch withholds at source, with verified citations', () => {
    const html = renderSsr();
    expect(html).toContain('Polonia'); // branch of the Polish XTB S.A., not RO-incorporated
    expect(html).toContain('intermediar rezident');
    expect(html).toContain('la sursă');
    expect(html).toContain('art. 96^1');
    expect(html).toContain('art. 97');
    expect(html).toContain('art. 123'); // foreign self-declared rate
    expect(html).toContain('art. 131'); // dividend foreign tax credit
  });

  it('carries the 2025 withholding rates (1% / 3%) scoped to the holding period', () => {
    const html = renderSsr();
    expect(html).toContain('1%');
    expect(html).toContain('3%');
    expect(html).toContain('365 de zile');
  });

  it('LOAD-BEARING: never claims an unqualified "no DU", always pairs the gains with the CASS exception', () => {
    const html = renderSsr();
    // The income-tax-only carve-out must be stated...
    expect(html).toContain('impozitul pe câștig');
    // ...AND the CASS exception must travel with it: gains count toward the
    // plafon, so an over-threshold XTB-only investor still files the DU for CASS.
    expect(html).toContain('se iau în calcul la plafon');
    expect(html).toContain('doar pentru CASS');
    expect(html).toContain('24.300');
  });

  it('never leaks a bare 2026 16% rate onto the 2025-scoped page (ghid convention)', () => {
    const html = renderSsr();
    expect(html).not.toContain('16%');
  });

  it('cross-links the cluster with crawlable anchors (related guides + hub)', () => {
    const html = renderSsr();
    expect(html).toMatch(/href="\/ghid\/declaratie-unica-trading212\/"/);
    expect(html).toMatch(/href="\/ghid\/dividende-broker-strain\/"/);
    expect(html).toMatch(/href="\/ghid\/"/);
  });

  it('emits FAQ questions used by the FAQPage schema', () => {
    const html = renderSsr();
    expect(html).toContain('Trebuie să declar câștigurile de la XTB');
    expect(html).toContain('Plătesc CASS dacă investesc prin XTB');
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });
});
