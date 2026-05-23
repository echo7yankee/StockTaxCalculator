import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ForgotPasswordPage from '../ForgotPasswordPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function submitButton() {
  return screen.getByRole('button', { name: 'Send reset link' });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ForgotPasswordPage - render', () => {
  it('renders the reset heading, email field, primary CTA, and back-to-login link', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to login' })).toBeInTheDocument();
  });
});

describe('ForgotPasswordPage - client-side validation', () => {
  it('blocks submit and shows the required error on an empty email', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderPage();
    await user.click(submitButton());
    expect(screen.getByRole('alert')).toHaveTextContent('This field is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks submit and shows the invalid-email error for a malformed address', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(submitButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordPage - submission state machine', () => {
  it('POSTs the trimmed email to /api/auth/forgot-password and shows the check-email panel on success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), '  maria@example.com  ');
    await user.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/forgot-password');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({ email: 'maria@example.com' });

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('shows the server error message when the API returns a non-ok status with an error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Email is required' }), { status: 400 })
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
    });
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('falls back to the generic reset-failed message when the API returns no error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to send reset link');
    });
  });

  it('shows the network error when the request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
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
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.click(submitButton());

    const pendingBtn = screen.getByRole('button', { name: 'Sending...' });
    expect(pendingBtn).toBeDisabled();

    resolveFetch(new Response('{}', { status: 200 }));
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
  });
});
