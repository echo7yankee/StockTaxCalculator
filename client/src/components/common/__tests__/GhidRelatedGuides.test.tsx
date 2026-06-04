import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import GhidRelatedGuides from '../GhidRelatedGuides';
import { GHID_LIST, GHID_RELATED } from '../../../lib/ghidIndexSchemas';

function renderAt(currentPath: string) {
  return render(
    <MemoryRouter>
      <GhidRelatedGuides currentPath={currentPath} />
    </MemoryRouter>,
  );
}

describe('GhidRelatedGuides', () => {
  it('renders the heading + the mapped guides as crawlable anchors with descriptive titles', () => {
    const path = '/ghid/declaratie-unica-trading212';
    renderAt(path);

    expect(screen.getByRole('heading', { name: 'Ghiduri conexe' })).toBeInTheDocument();

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const relatedPath of GHID_RELATED[path]) {
      const entry = GHID_LIST.find((g) => g.path === relatedPath)!;
      expect(hrefs).toContain(relatedPath); // real crawlable <a href>, not a JS-only button
      expect(screen.getByText(entry.title)).toBeInTheDocument(); // descriptive anchor text
    }
  });

  it('never links to the current page (no self-reference) for any mapped guide', () => {
    for (const path of Object.keys(GHID_RELATED)) {
      const { unmount } = renderAt(path);
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      expect(hrefs, `self-link rendered on ${path}`).not.toContain(path);
      unmount();
    }
  });

  it('renders nothing for an unmapped guide path', () => {
    const { container } = renderAt('/ghid/does-not-exist');
    expect(container).toBeEmptyDOMElement();
  });
});

describe('GHID_RELATED mapping invariants', () => {
  const validPaths = new Set(GHID_LIST.map((g) => g.path));

  it('has a non-empty related list for every guide in GHID_LIST', () => {
    for (const g of GHID_LIST) {
      expect(GHID_RELATED[g.path], `missing related-guides entry for ${g.path}`).toBeDefined();
      expect(GHID_RELATED[g.path].length).toBeGreaterThan(0);
    }
  });

  it('has no keys that are not real guide paths', () => {
    for (const key of Object.keys(GHID_RELATED)) {
      expect(validPaths.has(key), `GHID_RELATED key ${key} is not in GHID_LIST`).toBe(true);
    }
  });

  it('references only real guide paths, never itself, with no duplicates', () => {
    for (const [path, related] of Object.entries(GHID_RELATED)) {
      expect(new Set(related).size, `duplicate related path under ${path}`).toBe(related.length);
      for (const r of related) {
        expect(validPaths.has(r), `${path} -> ${r} is not a real guide`).toBe(true);
        expect(r, `${path} links to itself`).not.toBe(path);
      }
    }
  });
});
