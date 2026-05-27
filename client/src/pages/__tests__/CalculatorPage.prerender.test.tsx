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
import CalculatorPage from '../CalculatorPage';

beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderCalculatorSsr(url = '/calculator') {
  return renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <CalculatorPage />
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </StaticRouter>
    </HelmetProvider>,
  );
}

describe('CalculatorPage prerender (SSR)', () => {
  it('renders to a non-empty HTML string without throwing on browser globals', () => {
    const html = renderCalculatorSsr();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(300);
    expect(html).toContain('<h1');
  });

  it('emits the page title and subtitle (RO fallback)', () => {
    const html = renderCalculatorSsr();
    expect(html).toContain('Calculator fiscal');
    expect(html).toContain('anul fiscal 2025');
  });

  it('emits all four numeric input fields with their RO labels', () => {
    const html = renderCalculatorSsr();
    expect(html).toMatch(/id="calc-capital-gains"/);
    expect(html).toMatch(/id="calc-dividends"/);
    expect(html).toMatch(/id="calc-withholding"/);
    expect(html).toMatch(/id="calc-other-income"/);
    expect(html).toContain('Câștiguri nete de capital');
    expect(html).toContain('Dividende brute');
  });

  it('emits the calculate submit button', () => {
    const html = renderCalculatorSsr();
    expect(html).toContain('Calculează');
    expect(html).toMatch(/type="submit"/);
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });
});
