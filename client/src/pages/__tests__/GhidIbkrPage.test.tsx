import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidIbkrPage from '../GhidIbkrPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <GhidIbkrPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('GhidIbkrPage - crawlable conversion CTAs', () => {
  it('renders the top TL;DR CTA chip as a link to pricing', () => {
    renderPage();
    const topCta = screen.getByRole('link', { name: /Vrei calculul automat din extrasul IBKR.*Vezi planuri/ });
    expect(topCta).toHaveAttribute('href', '/pricing');
  });

  it('renders the bottom CTA pair as links (free calculator + paid IBKR upload)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Calculator gratuit \(manual\)/ })).toHaveAttribute('href', '/calculator');
    expect(screen.getByRole('link', { name: /Încarcă extrasul IBKR \(beta\)/ })).toHaveAttribute('href', '/pricing');
  });

  it('IBKR-upload CTA links to /pricing (paywall, not a free engine preview)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Încarcă extrasul IBKR \(beta\)/ })).toHaveAttribute('href', '/pricing');
  });

  it('renders the page nav as crawlable anchors (home + back to the guides hub)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Acasă/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Toate ghidurile/ })).toHaveAttribute('href', '/ghid');
  });
});

describe('GhidIbkrPage - beta posture', () => {
  it('surfaces a prominent verify-before-filing beta caveat', () => {
    renderPage();
    expect(screen.getByText(/IBKR este în beta\. Verifică cifrele înainte să depui\./)).toBeInTheDocument();
  });
});

describe('GhidIbkrPage - broker beta waitlist', () => {
  it('renders the broker_ibkr beta-graduation email capture with the export solicitation', () => {
    renderPage();
    expect(screen.getByText(/Te anunțăm când IBKR iese din beta/)).toBeInTheDocument();
    // The description doubles as the anonymized-export solicitation that graduates beta -> trusted.
    expect(screen.getByText(/Trimite-ni-l anonimizat/)).toBeInTheDocument();
    // Capture form chrome is present (the submit button from the subscribe namespace).
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument();
  });
});
