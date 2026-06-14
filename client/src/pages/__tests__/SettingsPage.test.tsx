import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ApiError } from '../../contexts/AuthContext';

const mockNavigate = vi.fn();
const mockDeleteAccount = vi.fn();
const mockExportData = vi.fn();
const mockToggleTheme = vi.fn();
const mockSetCountryCode = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/AuthContext')>(
    '../../contexts/AuthContext',
  );
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', email: 'maria@example.com', name: 'Maria Popescu', plan: 'paid' },
      loading: false,
      login: vi.fn(),
      signup: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      deleteAccount: mockDeleteAccount,
      exportData: mockExportData,
    }),
  };
});

vi.mock('../../contexts/CountryContext', () => ({
  useCountry: () => ({
    countryCode: 'RO',
    countryConfig: undefined,
    setCountryCode: mockSetCountryCode,
    supportedCountries: [
      { code: 'RO', name: 'Romania' },
      { code: 'BG', name: 'Bulgaria' },
    ],
  }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: mockToggleTheme }),
}));

vi.mock('../../lib/errorMonitor', () => ({
  reportCaughtError: vi.fn(),
}));

import SettingsPage from '../SettingsPage';

const VALID_PASSWORD = 'TestPass2026!';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockDeleteAccount.mockReset();
  mockExportData.mockReset();
  mockToggleTheme.mockReset();
  mockSetCountryCode.mockReset();
});

describe('SettingsPage - render', () => {
  it('renders the page heading and all main sections', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Country / Region' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your Data' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danger Zone' })).toBeInTheDocument();
  });

  it('renders the country select with the supported countries', () => {
    renderPage();
    const select = screen.getByLabelText('Country / Region') as HTMLSelectElement;
    expect(select.value).toBe('RO');
    expect(select).toContainHTML('<option value="RO">Romania</option>');
    expect(select).toContainHTML('<option value="BG">Bulgaria</option>');
  });

  it('shows the "Switch to Light" button when theme is dark', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Switch to Light' })).toBeInTheDocument();
  });
});

describe('SettingsPage - country + theme controls', () => {
  it('invokes setCountryCode when the country select changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText('Country / Region'), 'BG');
    expect(mockSetCountryCode).toHaveBeenCalledWith('BG');
  });

  it('invokes toggleTheme when the theme button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Switch to Light' }));
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsPage - change password validation', () => {
  it('blocks submit and shows field errors when all fields are empty', async () => {
    const user = userEvent.setup();
    renderPage();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));
    expect(fetchSpy).not.toHaveBeenCalled();
    // Required-field message for current password.
    expect(screen.getByText('Enter your current password')).toBeInTheDocument();
    // tooShort triggers for the empty new-password too.
    expect(
      screen.getByText('New password must be at least 8 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPass2025!');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));
    expect(
      screen.getByText('New password must be at least 8 characters.'),
    ).toBeInTheDocument();
  });

  it('rejects a new password from the common-password blocklist', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPass2025!');
    await user.type(screen.getByLabelText('New password'), 'password123');
    await user.type(screen.getByLabelText('Confirm new password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));
    expect(screen.getByText(/This password is too common/)).toBeInTheDocument();
  });

  it('rejects a confirm-password value that does not match', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPass2025!');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), 'DifferentPass1!');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });
});

describe('SettingsPage - change password submission', () => {
  it('POSTs to /api/auth/change-password and shows the success banner on 200', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPass2025!');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/auth/change-password',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ currentPassword: 'OldPass2025!', newPassword: VALID_PASSWORD }),
        }),
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('Password changed successfully.');
  });

  it('maps server-returned data.fields to per-field error messages on 4xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'Current password is incorrect',
          fields: { currentPassword: 'Current password is incorrect' },
        }),
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'WrongPass!');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    // The server-mapped field error appears under the currentPassword input,
    // and the page-level alert is suppressed (no duplication). The message
    // must appear exactly once in the document.
    await waitFor(() => {
      expect(screen.getAllByText('Current password is incorrect')).toHaveLength(1);
    });
    // The per-field error owns role="alert" on the input; confirm the form's
    // top-level error banner (different id) is not the one that surfaced it.
    const fieldError = screen.getByText('Current password is incorrect');
    expect(fieldError).toHaveAttribute('id', 'settings-current-password-error');
  });

  it('shows the server error message in an alert on a 4xx with no fields map', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Something went wrong' }), { status: 400 }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPass2025!');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    });
  });

  it('shows a network-error alert when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Network down'));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPass2025!');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to connect to the server/);
    });
  });

  it('shows the in-flight "Changing..." label while the request is pending', async () => {
    let resolveFetch!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPass2025!');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('button', { name: 'Changing...' })).toBeDisabled();
    resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Password changed successfully.');
    });
  });
});

describe('SettingsPage - GDPR export', () => {
  it('calls exportData when the Download My Data button is clicked', async () => {
    mockExportData.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Download My Data' }));
    expect(mockExportData).toHaveBeenCalledTimes(1);
  });

  it('renders an error alert when exportData rejects', async () => {
    mockExportData.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Download My Data' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to download data. Please try again.',
      );
    });
  });
});

describe('SettingsPage - delete account flow', () => {
  it('shows the confirmation panel after clicking the initial delete button', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Are you sure?' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete My Account' }));
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Permanently Delete Account' }),
    ).toBeDisabled();
  });

  it('keeps the permanent-delete button disabled until DELETE is typed verbatim', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Delete My Account' }));
    const input = screen.getByPlaceholderText('Type DELETE to confirm');
    await user.type(input, 'delete'); // wrong case
    expect(
      screen.getByRole('button', { name: 'Permanently Delete Account' }),
    ).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'DELETE');
    expect(
      screen.getByRole('button', { name: 'Permanently Delete Account' }),
    ).toBeEnabled();
  });

  it('calls deleteAccount and navigates to / on success', async () => {
    mockDeleteAccount.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Delete My Account' }));
    await user.type(screen.getByPlaceholderText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Permanently Delete Account' }));
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows an error alert and keeps the modal open when deleteAccount rejects', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new ApiError('Server error'));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Delete My Account' }));
    await user.type(screen.getByPlaceholderText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Permanently Delete Account' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to delete account. Please try again.',
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    // Confirmation panel still visible.
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('Cancel hides the confirmation panel and clears the input', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Delete My Account' }));
    await user.type(screen.getByPlaceholderText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
    // Re-opening it should show an empty input.
    await user.click(screen.getByRole('button', { name: 'Delete My Account' }));
    expect(
      (screen.getByPlaceholderText('Type DELETE to confirm') as HTMLInputElement).value,
    ).toBe('');
  });
});
