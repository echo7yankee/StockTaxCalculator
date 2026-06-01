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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GhidRevolutPage - conversion CTAs', () => {
  it('renders the top TL;DR CTA chip (Revolut-specific) linking to pricing', async () => {
    const user = userEvent.setup();
    renderPage();
    const topCta = screen.getByRole('button', { name: /Vrei calculul automat din extrasul Revolut.*Vezi planuri/ });
    expect(topCta).toBeInTheDocument();
    await user.click(topCta);
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  it('renders the bottom two-button pair (free calculator + paid Revolut upload)', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Calculator gratuit \(manual\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Încarcă extrasul Revolut \(beta\)/ })).toBeInTheDocument();
  });

  it('bottom free-calculator button navigates to /calculator', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Calculator gratuit \(manual\)/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/calculator');
  });

  it('bottom Revolut-upload button navigates to /pricing (paywall, not a free engine preview)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Încarcă extrasul Revolut \(beta\)/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
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
