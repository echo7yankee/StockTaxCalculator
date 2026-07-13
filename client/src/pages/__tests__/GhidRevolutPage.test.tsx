import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidRevolutPage from '../GhidRevolutPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <GhidRevolutPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('GhidRevolutPage - crawlable conversion CTAs', () => {
  it('renders the top TL;DR CTA chip (Revolut-specific) as a link to pricing', () => {
    renderPage();
    const topCta = screen.getByRole('link', { name: /Vrei calculul automat din extrasul Revolut.*Vezi planuri/ });
    expect(topCta).toHaveAttribute('href', '/pricing/');
  });

  it('renders the bottom CTA pair as links (free calculator + paid Revolut upload)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Calculator gratuit \(manual\)/ })).toHaveAttribute('href', '/calculator/');
    expect(screen.getByRole('link', { name: /Încarcă extrasul Revolut \(beta\)/ })).toHaveAttribute('href', '/pricing/');
  });

  it('Revolut-upload CTA links to /pricing (paywall, not a free engine preview)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Încarcă extrasul Revolut \(beta\)/ })).toHaveAttribute('href', '/pricing/');
  });

  it('renders the in-content CASS guide reference as a crawlable anchor', () => {
    renderPage();
    // The related-guides card title also matches; every match must carry the crawlable href.
    const cassLinks = screen.getAllByRole('link', { name: /CASS pe investiții/ });
    expect(cassLinks.length).toBeGreaterThan(0);
    for (const link of cassLinks) {
      expect(link).toHaveAttribute('href', '/ghid/cass-investitii/');
    }
  });

  it('renders the page nav as crawlable anchors (home + back to the guides hub)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Acasă/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Toate ghidurile/ })).toHaveAttribute('href', '/ghid/');
  });
});

describe('GhidRevolutPage - beta posture', () => {
  it('surfaces a prominent verify-before-filing beta caveat', () => {
    renderPage();
    expect(screen.getByText(/Revolut este în beta\. Verifică cifrele înainte să depui\./)).toBeInTheDocument();
  });

  it('documents the Account Statement Excel export recipe (not the P&L summary)', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Ce extras încarci în InvesTax/ })).toBeInTheDocument();
    // "Get statement" appears in both the recipe step and FAQ #3; assert presence, tolerate both.
    expect(screen.getAllByText(/Get statement/).length).toBeGreaterThan(0);
  });
});

describe('GhidRevolutPage - worked example uses per-transaction (art. 96) BNR conversion', () => {
  // Audit fix: convert each leg at its own BNR date (art. 96), not the USD gain at
  // one sale-date rate. Pin the corrected numbers against drift.
  it('states the per-leg method and shows the RON gain', () => {
    renderPage();
    expect(screen.getByText(/metoda per-tranzacție/)).toBeInTheDocument();
    expect(screen.getByText(/Câștig în RON: 32\.826,00 − 32\.081,77 = 744,23 RON/)).toBeInTheDocument();
  });

  it('shows the corrected capital-gains tax total (74,42 RON), not the aggregate-method 284,49 RON', () => {
    renderPage();
    expect(screen.getByText(/Total de plată ANAF:/)).toHaveTextContent(/74,42 RON/);
    expect(screen.queryByText(/284,49 RON/)).not.toBeInTheDocument();
  });
});

describe('GhidRevolutPage - broker beta waitlist', () => {
  it('renders the broker_revolut beta-graduation email capture with the export solicitation', () => {
    renderPage();
    expect(screen.getByText(/Te anunțăm când Revolut iese din beta/)).toBeInTheDocument();
    // The description doubles as the anonymized-export solicitation that graduates beta -> trusted.
    expect(screen.getByText(/Trimite-ni-l anonimizat/)).toBeInTheDocument();
    // Capture form chrome is present (the submit button from the subscribe namespace).
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument();
  });
});
