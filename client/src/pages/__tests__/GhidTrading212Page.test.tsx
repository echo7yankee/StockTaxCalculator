import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidTrading212Page from '../GhidTrading212Page';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <GhidTrading212Page />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('GhidTrading212Page - crawlable conversion CTAs', () => {
  it('renders the top TL;DR CTA chip as a link to pricing', () => {
    renderPage();
    const topCta = screen.getByRole('link', { name: /Vrei calculul automat din PDF Trading212.*Vezi planuri/ });
    expect(topCta).toHaveAttribute('href', '/pricing/');
  });

  it('renders the bottom CTA pair as links (free calculator + paid PDF upload)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Calculator gratuit \(manual\)/ })).toHaveAttribute('href', '/calculator/');
    expect(screen.getByRole('link', { name: /Upload PDF \(€12 lansare\)/ })).toHaveAttribute('href', '/pricing/');
  });

  it('renders the page nav as crawlable anchors (home + back to the guides hub)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Acasă/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Toate ghidurile/ })).toHaveAttribute('href', '/ghid/');
  });
});

describe('GhidTrading212Page - worked example uses per-transaction (art. 96) BNR conversion', () => {
  // Audit fix: the worked example must convert each buy/sell leg at its own BNR
  // date (art. 96, matching the engine since PR #150), NOT the USD gain at a single
  // sale-date rate. Pin the corrected numbers so a refactor cannot silently drift
  // them back to the disclaimed aggregate method.
  it('states the per-leg conversion method and shows the RON gain, not the USD-gain shortcut', () => {
    renderPage();
    expect(screen.getByText(/metoda per-tranzacție/)).toBeInTheDocument();
    expect(screen.getByText(/Câștig în RON: 7\.676,94 − 7\.079,99 = 596,95 RON/)).toBeInTheDocument();
  });

  it('shows the corrected capital-gains tax total (59,70 RON), not the aggregate-method 116,32 RON', () => {
    renderPage();
    expect(screen.getByText(/Total de plată ANAF:/)).toHaveTextContent(/59,70 RON/);
    expect(screen.queryByText(/116,32 RON/)).not.toBeInTheDocument();
  });
});
