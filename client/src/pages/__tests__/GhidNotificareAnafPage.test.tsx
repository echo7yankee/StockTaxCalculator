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
    expect(screen.getByRole('link', { name: /Toate ghidurile/ })).toHaveAttribute('href', '/ghid/');
  });

  it('routes the tool funnel through the free statement checker, then the paid upload', () => {
    renderPage();
    // Primary free entry: the engine-free pre-paywall parse checker (the funnel
    // the other broker ghid pages already use). Lets a notificare recipient
    // confirm we read their statement before paying.
    expect(screen.getByRole('link', { name: /Verifică extrasul gratuit/ })).toHaveAttribute(
      'href',
      '/verifica-extras'
    );
    // Paid conversion + manual estimator stay available (two-tier framing, never free-only).
    expect(screen.getByRole('link', { name: /Încarcă extrasul \(2023-2025\)/ })).toHaveAttribute('href', '/pricing/');
    expect(screen.getByRole('link', { name: /Calculator gratuit \(manual\)/ })).toHaveAttribute('href', '/calculator/');
  });

  it('offers the free parse check inline at the reconstruct-broker-history step', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /verifica gratuit extrasul/ })).toHaveAttribute(
      'href',
      '/verifica-extras'
    );
  });

  it('TL;DR routes to the free statement checker now that 2023/2024 compute (no more waitlist)', () => {
    renderPage();
    const tldrCta = screen.getByRole('link', {
      name: /InvesTax calculează acum automat anii 2023 și 2024/,
    });
    expect(tldrCta).toHaveAttribute('href', '/verifica-extras');
  });

  it('does not link to itself', () => {
    renderPage();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/ghid/notificare-anaf-venituri-strainatate/');
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

describe('GhidNotificareAnafPage - prior-years are now live (post PR #221 funnel reframe)', () => {
  it('drops the waitlist and announces 2023/2024/2025 are computed automatically', () => {
    renderPage();
    // The capability shipped (PR #221), so the demand-probe waitlist is gone:
    // no email-capture submit button, no "join the list" anchor.
    expect(screen.queryByRole('button', { name: /notify me/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/lista de așteptare/i)).not.toBeInTheDocument();
    // The CTA section now states all three years compute automatically.
    expect(
      screen.getByRole('heading', { name: /Pentru 2023, 2024 și 2025, calculul e deja automat/ })
    ).toBeInTheDocument();
  });

  it('carries the accountant price anchor in the offer block (P3: one payment vs per-year contabil)', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    // The per-year accountant cost vs one InvesTax payment for all supported years.
    expect(text).toContain('400-600 lei');
    expect(text).toContain('nu per an');
    // Anchor must not drag in the dormant 2026 16% rate on a prior-year page.
    expect(text).not.toContain('16%');
  });
});
