import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

// The spoke pages call useNavigate() for their button-based nav; mock it but keep the real
// <Link> so the "Ghiduri conexe" anchors still render as crawlable <a href>.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

import GhidTrading212Page from '../GhidTrading212Page';
import GhidRevolutPage from '../GhidRevolutPage';
import GhidIbkrPage from '../GhidIbkrPage';
import GhidCassPage from '../GhidCassPage';
import GhidDividendePage from '../GhidDividendePage';
import GhidDeclaratieUnicaPage from '../GhidDeclaratieUnicaPage';
import GhidCumCalculamPage from '../GhidCumCalculamPage';
import { GHID_LIST, GHID_RELATED } from '../../lib/ghidIndexSchemas';

const PAGES: { path: string; Page: ComponentType }[] = [
  { path: '/ghid/declaratie-unica-trading212', Page: GhidTrading212Page },
  { path: '/ghid/declaratie-unica-revolut', Page: GhidRevolutPage },
  { path: '/ghid/declaratie-unica-ibkr', Page: GhidIbkrPage },
  { path: '/ghid/cass-investitii', Page: GhidCassPage },
  { path: '/ghid/dividende-broker-strain', Page: GhidDividendePage },
  { path: '/ghid/cum-completez-declaratia-unica', Page: GhidDeclaratieUnicaPage },
  { path: '/ghid/cum-calculam', Page: GhidCumCalculamPage },
];

function renderPage(Page: ComponentType) {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Ghid spoke pages - "Ghiduri conexe" interlinking wired on every page', () => {
  it('asserts a page for every guide in GHID_LIST (no spoke left unwired)', () => {
    const tested = new Set(PAGES.map((p) => p.path));
    expect(tested.size).toBe(GHID_LIST.length);
    for (const g of GHID_LIST) {
      expect(tested.has(g.path), `no wiring assertion for ${g.path}`).toBe(true);
    }
  });

  for (const { path, Page } of PAGES) {
    it(`renders the related-guides section with crawlable anchors on ${path}`, () => {
      const { unmount } = renderPage(Page);

      expect(screen.getByRole('heading', { name: 'Ghiduri conexe' })).toBeInTheDocument();

      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      for (const relatedPath of GHID_RELATED[path]) {
        expect(hrefs, `${path} missing crawlable link to ${relatedPath}`).toContain(relatedPath);
      }
      expect(hrefs, `${path} links to itself`).not.toContain(path);

      unmount();
    });
  }
});
