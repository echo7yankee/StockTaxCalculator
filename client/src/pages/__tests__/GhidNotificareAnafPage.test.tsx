import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidNotificareAnafPage from '../GhidNotificareAnafPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <GhidNotificareAnafPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('GhidNotificareAnafPage - crawlable nav and CTAs', () => {
  it('renders the page nav as crawlable anchors (home + back to the guides hub)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Acasă/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Toate ghidurile/ })).toHaveAttribute('href', '/ghid');
  });

  it('renders the 2025-scoped CTA pair as links (free calculator + paid upload)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Calculator gratuit \(manual\)/ })).toHaveAttribute('href', '/calculator');
    expect(screen.getByRole('link', { name: /Încarcă extrasul \(anul 2025\)/ })).toHaveAttribute('href', '/pricing');
  });

  it('TL;DR links to the waitlist anchor on the same page (the demand probe, not a paid funnel)', () => {
    renderPage();
    const tldrCta = screen.getByRole('link', { name: /Intră pe lista de așteptare/ });
    expect(tldrCta).toHaveAttribute('href', '#lista-asteptare');
  });

  it('does not link to itself', () => {
    renderPage();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/ghid/notificare-anaf-venituri-strainatate');
  });
});

describe('GhidNotificareAnafPage - prior-year tax facts (2023/2024 scope)', () => {
  it('states the 8% dividend rate for 2023/2024 (the one delta vs 2025) without leaking 16%', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('8%');
    expect(text).toContain('10%');
    // 16% is the dormant 2026 rate (Legea 239/2025); it must never appear on
    // a prior-year page.
    expect(text).not.toContain('16%');
  });

  it('carries the year-specific CASS thresholds for both years', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('18.000 / 36.000 / 72.000');
    expect(text).toContain('19.800 / 39.600 / 79.200');
  });

  it('scopes itself to 2023/2024 and warns against extrapolating to 2022 and earlier', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Acest ghid acoperă anii 2023 și 2024.');
    expect(text).toContain('2022');
  });

  it('labels the accessories walkthrough as an illustrative example, not an estimate', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Exemplu pur ilustrativ');
    expect(text).toContain('nu o estimare pentru cazul tău');
  });

  it('carries the prescription caveat (filing interrupts it; waiting is not advice)', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('întrerupe prescripția');
  });

  it('carries the not-personalized-advice guardrail', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('instrument software, nu consultanță fiscală personalizată');
  });
});

describe('GhidNotificareAnafPage - prior-years waitlist (the demand probe)', () => {
  it('renders the prior_years email capture with the honest 2025-only framing', () => {
    renderPage();
    expect(screen.getByText(/Vrei calcul automat pentru anii 2023 și 2024\?/)).toBeInTheDocument();
    // The 2025-only framing appears in both the capture description and the FAQ
    // answer; either way it must be on the page at least once.
    expect(screen.getAllByText(/Motorul InvesTax acoperă azi anul fiscal 2025/).length).toBeGreaterThanOrEqual(1);
    // Capture form chrome is present (the submit button from the subscribe namespace).
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument();
  });
});
