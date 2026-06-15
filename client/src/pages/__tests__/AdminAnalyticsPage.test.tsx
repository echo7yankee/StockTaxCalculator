import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import AdminAnalyticsPage from '../AdminAnalyticsPage';

const SUMMARY = {
  label: 'last 30 days',
  total: 42,
  pageviews: 30,
  daily: [
    { date: '2026-06-11', events: 10, pageviews: 7 },
    { date: '2026-06-12', events: 18, pageviews: 12 },
    { date: '2026-06-13', events: 14, pageviews: 11 },
  ],
  topPaths: [
    { path: '/', count: 12 },
    { path: '/pricing', count: 8 },
  ],
  topReferrers: [{ host: 'chatgpt.com', count: 5 }],
  funnel: [
    { name: 'paywall_seen', count: 10 },
    { name: 'pricing_viewed', count: 8 },
    { name: 'checkout_started', count: 3 },
    { name: 'payment_completed', count: 1 },
  ],
  otherEvents: [
    { name: 'signup_completed', count: 4 },
    { name: 'calculator_used', count: 20 },
  ],
};

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <AdminAnalyticsPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state before the first response', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText(/Loading analytics/)).toBeInTheDocument();
  });

  it('renders the funnel, counters, top pages and referrers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SUMMARY), { status: 200 })
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    // Funnel step names + a derived conversion percentage.
    expect(screen.getByText('paywall_seen')).toBeInTheDocument();
    expect(screen.getByText('payment_completed')).toBeInTheDocument();
    expect(screen.getByText(/80\.0% of prev/)).toBeInTheDocument();
    // Top pages + referrers + other events.
    expect(screen.getByText('/pricing')).toBeInTheDocument();
    expect(screen.getByText('chatgpt.com')).toBeInTheDocument();
    expect(screen.getByText('calculator_used')).toBeInTheDocument();
  });

  it('renders the daily activity time-series chart with a legend', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SUMMARY), { status: 200 })
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    expect(screen.getByText('Daily activity')).toBeInTheDocument();
    // Legend ("Events" is exact-unique; the headline counter reads "Total events").
    expect(screen.getByText('Events')).toBeInTheDocument();
    // The chart is an accessible <svg role="img"> labelled with its date range.
    expect(
      screen.getByRole('img', { name: /Daily events and pageviews/ })
    ).toBeInTheDocument();
  });

  it('prompts to log in on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Sign in as an admin/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Log in/ })).toHaveAttribute('href', '/login');
  });

  it('explains the ADMIN_EMAILS allowlist on 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 403 }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/does not have analytics access/)).toBeInTheDocument();
    });
    expect(screen.getByText('ADMIN_EMAILS')).toBeInTheDocument();
  });

  it('shows an error when the fetch fails outright', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Could not load analytics/)).toBeInTheDocument();
    });
  });

  it('refetches with the new window when a range is selected', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(SUMMARY), { status: 200 }));
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '7 days' }));

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes('days=7'))).toBe(true);
    });
  });
});
