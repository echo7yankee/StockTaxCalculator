import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import GhidCassPage from '../GhidCassPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <GhidCassPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GhidCassPage - conversion CTAs', () => {
  it('renders the top TL;DR CTA chip linking to pricing', async () => {
    const user = userEvent.setup();
    renderPage();
    const topCta = screen.getByRole('button', { name: /Vrei calculul automat din PDF Trading212.*Vezi planuri/ });
    expect(topCta).toBeInTheDocument();
    await user.click(topCta);
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  it('renders the bottom two-button pair (free calculator + paid PDF upload)', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Calculator gratuit \(manual\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload PDF \(€19 lansare\)/ })).toBeInTheDocument();
  });

  it('bottom free-calculator button navigates to /calculator', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Calculator gratuit \(manual\)/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/calculator');
  });

  it('bottom upload-PDF button navigates to /pricing', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Upload PDF \(€19 lansare\)/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });
});
