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
import ContactPage from '../ContactPage';

beforeAll(async () => {
  await i18n.changeLanguage('ro');
});

function renderContactSsr(url = '/contact') {
  return renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <ContactPage />
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </StaticRouter>
    </HelmetProvider>,
  );
}

describe('ContactPage prerender (SSR)', () => {
  it('renders to a non-empty HTML string without throwing on browser globals', () => {
    const html = renderContactSsr();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('<h1');
  });

  it('emits the contact form (idle status renders the form, not the success state)', () => {
    const html = renderContactSsr();
    expect(html).toContain('<form');
  });

  it('does not throw when location.state is absent (no prefill during SSR)', () => {
    // ContactPage reads location.state for the parse-warning prefill; under
    // StaticRouter that is undefined, so the form must render with an empty message.
    expect(() => renderContactSsr()).not.toThrow();
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });
});
