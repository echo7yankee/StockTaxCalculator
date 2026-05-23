import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ResetPasswordPage from '../ResetPasswordPage';

const VALID_PASSWORD = 'TestPass2026!';
const VALID_TOKEN = 'abc123token';

function renderPage(initialEntry = `/reset-password?token=${VALID_TOKEN}`) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ResetPasswordPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function submitButton() {
  return screen.getByRole('button', { name: 'Reset password' });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
  await user.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ResetPasswordPage - missing token', () => {
  it('shows the invalid-link panel and a request-new-link CTA when the URL has no token', () => {
    renderPage('/reset-password');
    expect(screen.getByRole('heading', { name: 'Invalid reset link' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('shows the invalid-link panel when the token query parameter is empty', () => {
    renderPage('/reset-password?token=');
    expect(screen.getByRole('heading', { name: 'Invalid reset link' })).toBeInTheDocument();
  });
});

describe('ResetPasswordPage - render with token', () => {
  it('renders the new-password heading, both password fields, and the primary CTA', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Set new password' })).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
  });
});

describe('ResetPasswordPage - client-side validation', () => {
  it('blocks submit and shows the required error on an empty form', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderPage();
    await user.click(submitButton());
    expect(screen.getAllByText('This field is required').length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(submitButton());
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a password from the common-password blocklist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('New password'), 'password123');
    await user.type(screen.getByLabelText('Confirm new password'), 'password123');
    await user.click(submitButton());
    expect(screen.getByText(/This password is too common/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a confirm-password value that does not match', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), 'DifferentPass1!');
    await user.click(submitButton());
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordPage - submission state machine', () => {
  it('POSTs the token + password to /api/auth/reset-password and shows the success panel on 200', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/reset-password');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({
      token: VALID_TOKEN,
      password: VALID_PASSWORD,
    });

    await waitFor(() => {
      expect(screen.getByText('Password reset!')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  it('shows the server error message when the API returns a non-ok status with an error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Token expired' }), { status: 400 })
    );
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Token expired');
    });
    expect(screen.queryByText('Password reset!')).not.toBeInTheDocument();
  });

  it('falls back to the generic reset-failed message when the API returns no error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to reset password');
    });
  });

  it('shows the network error when the request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to connect to the server');
    });
  });

  it('disables the submit button and shows the in-flight label while the request is pending', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { resolveFetch = resolve; });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pending);
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    const pendingBtn = screen.getByRole('button', { name: 'Resetting...' });
    expect(pendingBtn).toBeDisabled();

    resolveFetch(new Response('{}', { status: 200 }));
    await waitFor(() => {
      expect(screen.getByText('Password reset!')).toBeInTheDocument();
    });
  });
});
