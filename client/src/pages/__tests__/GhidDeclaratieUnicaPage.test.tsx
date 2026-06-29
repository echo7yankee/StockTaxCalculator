import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidDeclaratieUnicaPage from '../GhidDeclaratieUnicaPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <GhidDeclaratieUnicaPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('GhidDeclaratieUnicaPage - crawlable conversion CTAs', () => {
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

  it('links every referenced guide (inline chapter refs + situații specifice) as crawlable anchors', () => {
    renderPage();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const path of [
      '/ghid/declaratie-unica-trading212/',
      '/ghid/declaratie-unica-revolut/',
      '/ghid/dividende-broker-strain/',
      '/ghid/cass-investitii/',
    ]) {
      expect(hrefs, `missing crawlable guide link to ${path}`).toContain(path);
    }
  });
});
