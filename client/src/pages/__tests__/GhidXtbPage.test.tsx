import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidXtbPage from '../GhidXtbPage';
import { GHID_XTB_FAQS } from '../../lib/ghidXtbSchemas';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <GhidXtbPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('GhidXtbPage - crawlable nav and CTAs', () => {
  it('renders the page nav as crawlable anchors (home + back to the guides hub)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Acasă/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Toate ghidurile/ })).toHaveAttribute('href', '/ghid/');
  });

  it('renders the 2025-scoped two-tier CTA pair as links (free calculator + paid upload)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Calculator gratuit \(manual\)/ })).toHaveAttribute('href', '/calculator/');
    expect(screen.getByRole('link', { name: /Încarcă extrasul \(anul 2025\)/ })).toHaveAttribute('href', '/pricing/');
  });

  it('does not link to itself', () => {
    renderPage();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/ghid/impozit-xtb/');
  });
});

describe('GhidXtbPage - XTB tax facts (2025 scope, source-withholding regime)', () => {
  it('frames XTB as the RO branch of the Polish S.A. (not a RO-incorporated company)', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('XTB S.A. (Polonia)');
    expect(text).toContain('intermediar rezident');
  });

  it('LOAD-BEARING: states the income-tax carve-out together with the CASS exception', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    // Income tax on XTB gains is withheld at source (final) -> not self-declared...
    expect(text).toContain('impozit final');
    // ...but the gains still count toward the CASS plafon, so an over-threshold
    // XTB-only investor still files the DU for CASS. The two must never be split.
    expect(text).toContain('se iau în calcul la plafonul de CASS');
    expect(text).toContain('doar pentru CASS');
  });

  it('carries the 2025 CASS thresholds and the dividend obligation that remains', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('24.300 / 48.600 / 97.200 lei');
    expect(text).toContain('Dividendele din acțiuni străine');
  });

  it('states the US dividend withholding example as 10% (W-8BEN treaty rate), not 15%', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    // The RO-USA treaty W-8BEN dividend rate is 10%; 15% is the Germany/Netherlands
    // rate. Guards against the DE/NL bleed that put a wrong 15% on this page.
    expect(text).toContain('10% pe dividendele din SUA');
    expect(text).not.toContain('15%');
  });

  it('does not leak the dormant 2026 16% rate (page is 2025-scoped)', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toContain('16%');
  });

  it('carries the not-personalized-advice guardrail in a peer (not pro-contabil) voice', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('instrument software, nu consultanță fiscală personalizată');
  });
});

describe('GHID_XTB_FAQS structured data (JSON-LD tax facts)', () => {
  it('the dividend FAQ answer uses the 10% US W-8BEN rate, not 15%', () => {
    const dividendFaq = GHID_XTB_FAQS.find((f) => f.q.includes('dividende prin XTB'));
    expect(dividendFaq).toBeDefined();
    expect(dividendFaq?.a).toContain('10% pe dividendele din SUA');
    expect(dividendFaq?.a).not.toContain('15%');
  });

  it('no FAQ answer cites a 15% rate (Germany/Netherlands rate must not bleed into XTB content)', () => {
    expect(GHID_XTB_FAQS.every((f) => !f.a.includes('15%'))).toBe(true);
  });
});
