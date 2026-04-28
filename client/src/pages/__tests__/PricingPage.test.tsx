import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const mockUseAuth = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../lib/analytics', () => ({
  analytics: {
    pricingViewed: vi.fn(),
    checkoutStarted: vi.fn(),
  },
}));

import PricingPage from '../PricingPage';

function renderPricing() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <PricingPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('PricingPage — Section 3.9 Site 3 (promo/price skeleton)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(),
      signup: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('renders skeletons (badge + price) while the promo fetch is pending — no hardcoded English string, no €19/€12 flash', () => {
    // Fetch never resolves so we capture the initial loading state.
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderPricing();

    expect(screen.getByTestId('promo-badge-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('promo-badge-skeleton')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('price-skeleton')).toBeInTheDocument();

    // sr-only label is i18n'd
    expect(screen.getByText('Loading launch offer')).toBeInTheDocument();

    // The hardcoded English string from the previous implementation must be gone.
    expect(screen.queryByText('Loading promo...')).not.toBeInTheDocument();

    // The price text must NOT be visible during load — otherwise it would flash from €19 to €12.
    expect(screen.queryByText('€19')).not.toBeInTheDocument();
    expect(screen.queryByText('€12')).not.toBeInTheDocument();
  });

  it('replaces both skeletons with the real launch badge and €12 price once the promo resolves with launch spots remaining', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 2, limit: 100, remaining: 98 }), { status: 200 })
    );
    renderPricing();

    await waitFor(() => {
      expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId('price-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('€12')).toBeInTheDocument();
    // Real launch-spots badge text from the i18n key (with interpolated remaining/limit)
    expect(screen.getByText(/Launch special/)).toBeInTheDocument();
    expect(screen.getByText(/98\/100 launch spots left/)).toBeInTheDocument();
  });

  it('replaces both skeletons with the regular €19 price when launch spots are sold out', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 100, limit: 100, remaining: 0 }), { status: 200 })
    );
    renderPricing();

    await waitFor(() => {
      expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId('price-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('€19')).toBeInTheDocument();
  });
});

describe('PricingPage — checkout 502 friendlier message', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@example.com', name: 'A', plan: 'free' },
      loading: false,
      login: vi.fn(),
      signup: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('shows the translated "provider unavailable" alert when /api/payment/checkout returns 502', async () => {
    const promoResponse = new Response(
      JSON.stringify({ count: 0, limit: 100, remaining: 100 }),
      { status: 200 }
    );
    const checkoutResponse = new Response(
      JSON.stringify({ error: 'Payment provider temporarily unavailable, please try again in a moment' }),
      { status: 502 }
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(promoResponse)
      .mockResolvedValueOnce(checkoutResponse);

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <HelmetProvider>
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument();
    });

    const buyButton = screen.getByRole('button', { name: /Get full access/i });
    fireEvent.click(buyButton);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        'Payment provider is temporarily unavailable. Please try again in a moment.'
      );
    });

    // Sanity: we hit the checkout endpoint exactly once after the promo fetch.
    expect(fetchMock).toHaveBeenCalledWith('/api/payment/checkout', { credentials: 'include' });
  });
});
