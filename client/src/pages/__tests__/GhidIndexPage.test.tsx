import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidIndexPage from '../GhidIndexPage';
import { GHID_LIST } from '../../lib/ghidIndexSchemas';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <GhidIndexPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('GhidIndexPage - crawlable internal links', () => {
  it('renders the top intro CTA chip as a link to pricing', () => {
    renderPage();
    const topCta = screen.getByRole('link', { name: /Vrei calculul automat din PDF Trading212.*Vezi planuri/ });
    expect(topCta).toHaveAttribute('href', '/pricing/');
  });

  it('renders the bottom CTA pair as links (free calculator + paid PDF upload)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Calculator gratuit \(manual\)/ })).toHaveAttribute('href', '/calculator/');
    expect(screen.getByRole('link', { name: /Upload PDF \(€12 lansare\)/ })).toHaveAttribute('href', '/pricing/');
  });

  it('links every guide as a crawlable anchor (not a JS-only button)', () => {
    renderPage();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const g of GHID_LIST) {
      expect(hrefs).toContain(g.path);
    }
  });
});
