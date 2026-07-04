import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const mockUseAuth = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../lib/analytics', () => ({
  analytics: {
    pricingViewed: vi.fn(),
    checkoutStarted: vi.fn(),
  },
}));

import PricingPage from '../PricingPage';
import { writePendingParse } from '../../lib/pendingParse';
import type { PdfParseResult } from '@shared/parsers/trading212Pdf';

// Keep the gate token from leaking between tests (a seed in one must not open the
// gate in another). Cleared after every test regardless of describe block.
afterEach(() => {
  window.sessionStorage.clear();
});

/** Seed the pre-pay gate token: a valid pending parse in sessionStorage, standing in
 *  for the green unlock PreviewPage writes. Its presence opens the checkout gate. */
function seedPendingParse() {
  const pdf = {
    year: 2025,
    overview: { currency: 'USD', closedResult: 1000, taxWithheld: 0 },
    sellTrades: [{ ticker: 'AAPL', isin: 'US0378331005', executionTime: '2025-06-01' }],
    dividends: [],
    distributions: [],
    warnings: [],
  } as unknown as PdfParseResult;
  writePendingParse({ fileType: 'pdf', fileName: 'annual-statement-2025.pdf', pdf });
}

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

describe('PricingPage - notificare / prior-year offer (P3)', () => {
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
    // Resolve the promo fetch so the page settles; the offer block is
    // independent of promo state but this avoids act() noise.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ count: 0, limit: 100, remaining: 100 }), { status: 200 })
    );
  });

  it('renders the ANAF compliance-notice offer block with the accountant price anchor', async () => {
    renderPricing();
    await waitFor(() => {
      expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument();
    });

    expect(
      screen.getByRole('heading', { name: /Got a compliance notice/i })
    ).toBeInTheDocument();
    // The offer's crux: an accountant bills per year; one payment covers all years.
    expect(screen.getByText(/400-600 lei/)).toBeInTheDocument();
    expect(screen.getByText(/single InvesTax payment/i)).toBeInTheDocument();
    // Honest guardrail must be present (no outcome promises, no personalized advice).
    expect(screen.getByText(/not personalized tax advice/i)).toBeInTheDocument();
  });

  it('routes the offer block to the notificare guide and the free statement checker', async () => {
    renderPricing();
    await waitFor(() => {
      expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument();
    });

    expect(
      screen.getByRole('link', { name: /Read the compliance-notice guide/i })
    ).toHaveAttribute('href', '/ghid/notificare-anaf-venituri-strainatate/');
    expect(
      screen.getByRole('link', { name: /Check your statement for free/i })
    ).toHaveAttribute('href', '/verifica-extras');
  });

  it('exposes a prior-year FAQ item (q9) without leaking the dormant 2026 16% rate', async () => {
    renderPricing();
    await waitFor(() => {
      expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument();
    });

    // q9 question renders; the 8% prior-year rate is the truthful claim.
    expect(screen.getByText(/Can I compute past years/i)).toBeInTheDocument();
    // Guard scoped to the prior-year offer block: the FAQ a8 answer legitimately
    // cites the 16% rate for tax year 2026, so this must not be a whole-page check.
    const offerHeading = screen.getByRole('heading', { name: /Got a compliance notice/i });
    const offerSection = offerHeading.closest('section');
    expect(offerSection?.textContent ?? '').not.toContain('16%');
  });
});

describe('PricingPage — checkout 502 friendlier message', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    mockNavigate.mockReset();
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
    // The pre-pay gate must be OPEN for checkout to fire: seed a verified parse.
    seedPendingParse();
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

    const buyButton = screen.getByTestId('pricing-buy-cta');
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

describe('PricingPage - pre-pay parse gate (PR-3)', () => {
  /** Render with only the promo fetch stubbed (resolves so the page settles). */
  function renderSettled() {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ count: 0, limit: 100, remaining: 100 }), { status: 200 })
    );
    return render(
      <HelmetProvider>
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>
      </HelmetProvider>
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    mockNavigate.mockReset();
  });

  it('WITHOUT a verified parse: Buy is a "check your file first" CTA that routes to the checker, NOT checkout (logged-in free)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'a@example.com', plan: 'free' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ count: 0, limit: 100, remaining: 100 }), { status: 200 })
    );

    render(
      <HelmetProvider>
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument());

    // The gate is closed: the CTA reads as a free pre-check and the benefit note shows.
    expect(screen.getByText('Check your file first')).toBeInTheDocument();
    expect(screen.getByTestId('pricing-check-first-note')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pricing-buy-cta'));

    // Routed to the free checker; checkout is NOT called (no charge without a parse).
    expect(mockNavigate).toHaveBeenCalledWith('/verifica-extras');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/payment/checkout', { credentials: 'include' });
  });

  it('WITHOUT a verified parse: an anonymous visitor is ALSO routed to the checker, not to login', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderSettled();
    await waitFor(() => expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('pricing-buy-cta'));
    // The parse gate is checked BEFORE the auth gate: no file, go check the file.
    expect(mockNavigate).toHaveBeenCalledWith('/verifica-extras');
    expect(mockNavigate).not.toHaveBeenCalledWith('/login?redirect=/pricing');
  });

  it('WITH a verified parse (anonymous): Buy routes to login with redirect back to pricing', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    seedPendingParse();
    renderSettled();
    await waitFor(() => expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument());

    // Gate open: the buy label is the login-to-buy copy, no check-first note.
    expect(screen.queryByTestId('pricing-check-first-note')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pricing-buy-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('/login?redirect=/pricing');
  });

  it('WITH a verified parse (logged-in free): Buy proceeds to checkout', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'a@example.com', plan: 'free' } });
    seedPendingParse();
    const checkoutUrl = 'https://checkout.stripe.com/c/pay/test';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 0, limit: 100, remaining: 100 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ checkoutUrl }), { status: 200 }));

    // jsdom does not implement navigation; stub the href setter so the checkout
    // redirect does not throw. We only assert the checkout endpoint was hit.
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, set href(v: string) { hrefSetter(v); } },
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => expect(screen.queryByTestId('promo-badge-skeleton')).not.toBeInTheDocument());

    // Gate open: the CTA is the normal buy button, no check-first note.
    expect(screen.getByText('Get full access')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pricing-buy-cta'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/payment/checkout', { credentials: 'include' });
    });
    // The checker route is never taken when the gate is open.
    expect(mockNavigate).not.toHaveBeenCalledWith('/verifica-extras');
  });
});
