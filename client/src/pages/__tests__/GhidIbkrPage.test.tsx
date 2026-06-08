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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GhidIbkrPage - conversion CTAs', () => {
  it('renders the top TL;DR CTA chip linking to pricing', async () => {
    const user = userEvent.setup();
    renderPage();
    const topCta = screen.getByRole('button', { name: /Vrei calculul automat din extrasul IBKR.*Vezi planuri/ });
    expect(topCta).toBeInTheDocument();
    await user.click(topCta);
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  it('renders the bottom two-button pair (free calculator + paid IBKR upload)', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Calculator gratuit \(manual\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Încarcă extrasul IBKR \(beta\)/ })).toBeInTheDocument();
  });

  it('bottom free-calculator button navigates to /calculator', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Calculator gratuit \(manual\)/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/calculator');
  });

  it('bottom IBKR-upload button navigates to /pricing (paywall, not a free engine preview)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Încarcă extrasul IBKR \(beta\)/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
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
