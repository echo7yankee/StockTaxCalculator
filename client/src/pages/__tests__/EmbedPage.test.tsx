import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import EmbedPage from '../EmbedPage';

const writeText = vi.fn().mockResolvedValue(undefined);

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <EmbedPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  writeText.mockClear();
  // navigator.clipboard is a getter-only prop in happy-dom; define over it.
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('EmbedPage', () => {
  it('renders the heading and a live preview iframe pointing at the widget route', () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /Pune calculatorul InvesTax/ })).toBeInTheDocument();
    expect(container.querySelector('iframe[src="/embed/calculator"]')).toBeTruthy();
  });

  it('exposes a snippet that carries the iframe src AND the attribution backlink', () => {
    const { container } = renderPage();
    const snippet = container.querySelector('pre')?.textContent ?? '';
    expect(snippet).toContain('https://investax.app/embed/calculator');
    // The visible attribution <a> is the backlink that justifies shipping the free
    // widget; it must be present in the copy-paste snippet.
    expect(snippet).toContain('href="https://investax.app"');
    expect(snippet).toContain('Calculator oferit de');
  });

  it('documents the dark-theme query param', () => {
    renderPage();
    expect(screen.getAllByText(/\?theme=dark/).length).toBeGreaterThan(0);
  });

  it('copies the snippet (including the backlink) to the clipboard', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Copiază/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('https://investax.app/embed/calculator'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('href="https://investax.app"'));
    expect(await screen.findByText('Copiat')).toBeInTheDocument();
  });

  it('routes its CTAs to contact and the free checker', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /^Contact/ })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: /Verifică un extras gratuit/ })).toHaveAttribute('href', '/verifica-extras');
  });
});
