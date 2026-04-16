import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Dashboard from '../Dashboard';

// Mock useAuth to simulate logged-in user
const mockUser = { id: 'test-id', email: 'test@test.com', name: 'Test', plan: 'paid' };
const mockAuth = {
  user: mockUser,
  loading: false,
  login: vi.fn(),
  signup: vi.fn(),
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
};
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../contexts/UploadContext', () => ({
  useUpload: () => ({
    setUploadData: vi.fn(),
    clearUpload: vi.fn(),
    parseResult: null,
    transactions: [],
    taxResult: null,
    securities: [],
    fileName: '',
    taxYear: 2025,
  }),
}));

const mockTaxYears = [
  {
    id: '1',
    year: 2025,
    country: 'RO',
    totalTaxOwed: 29000,
    capitalGainsTax: 19200,
    dividendTaxOwed: 54,
    cassOwed: 9720,
    earlyFilingDiscount: 870,
    calculatedAt: '2025-03-15T10:00:00Z',
    fileName: 'annual-statement-2025.pdf',
    broker: 'trading212',
  },
  {
    id: '2',
    year: 2024,
    country: 'RO',
    totalTaxOwed: 5000,
    capitalGainsTax: 3000,
    dividendTaxOwed: 100,
    cassOwed: 2430,
    earlyFilingDiscount: 93,
    calculatedAt: '2024-04-01T12:00:00Z',
    fileName: 'trading212-2024.csv',
    broker: 'trading212',
  },
];

function renderDashboard() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})); // never resolves
    renderDashboard();
    // The sr-only loading label still renders so screen-readers announce loading.
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the real <thead> immediately and 3 skeleton rows while loading (Section 3.9 Site 2)', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})); // never resolves
    renderDashboard();

    // Header columns are rendered up-front (synchronous i18n), preventing a table-pop-in jump.
    expect(screen.getByText('Year')).toBeInTheDocument();
    expect(screen.getByText('Total Tax')).toBeInTheDocument();

    // Three skeleton rows reserve the table footprint while the fetch is in flight.
    const tbody = screen.getByText('Year').closest('table')?.querySelector('tbody');
    expect(tbody).not.toBeNull();
    expect(tbody!.querySelectorAll('tr').length).toBe(3);

    // The table region is marked aria-busy for assistive tech.
    expect(screen.getByText('Year').closest('table')).toHaveAttribute('aria-busy', 'true');

    // The previous spinner UI must be gone.
    expect(screen.queryByText('Loading your data...')).not.toBeInTheDocument();
  });

  it('shows empty state when no saved calculations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No saved calculations yet.')).toBeInTheDocument();
    });
  });

  it('renders saved tax years in a table', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockTaxYears), { status: 200 })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('2025')).toBeInTheDocument();
      expect(screen.getByText('2024')).toBeInTheDocument();
    });

    expect(screen.getByText('annual-statement-2025.pdf')).toBeInTheDocument();
    expect(screen.getByText('trading212-2024.csv')).toBeInTheDocument();
  });

  it('displays tax amounts formatted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockTaxYears), { status: 200 })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('29,000.00')).toBeInTheDocument();
      expect(screen.getByText('19,200.00')).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Could not load saved calculations/)).toBeInTheDocument();
    });
  });

  it('deletes a tax year when delete button is clicked', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTaxYears), { status: 200 })) // initial fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 })); // delete

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('2025')).toBeInTheDocument();
    });

    // Click first delete button
    const deleteButtons = screen.getAllByTitle('Delete');
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('2025')).not.toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/tax-years/1', { method: 'DELETE', credentials: 'include' });
  });

  it('renders quick action links', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    renderDashboard();

    expect(screen.getByText('Upload Statement')).toBeInTheDocument();
    expect(screen.getByText('Quick Calculator')).toBeInTheDocument();
  });

  it('shows non-OK response as error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 500 })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Could not load saved calculations/)).toBeInTheDocument();
    });
  });
});
