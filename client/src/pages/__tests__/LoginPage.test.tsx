import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const mockNavigate = vi.fn();
const mockLogin = vi.fn();
const mockLoginWithGoogle = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/AuthContext')>('../../contexts/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: null,
      loading: false,
      login: mockLogin,
      signup: vi.fn(),
      loginWithGoogle: mockLoginWithGoogle,
      logout: vi.fn(),
      deleteAccount: vi.fn(),
      exportData: vi.fn(),
    }),
  };
});

import LoginPage from '../LoginPage';

type RouterEntry = string | { pathname: string; state?: unknown };

function renderPage(initialEntries: RouterEntry[] = ['/login']) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <LoginPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function submitButton() {
  return screen.getByRole('button', { name: 'Log in' });
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockLogin.mockReset();
  mockLoginWithGoogle.mockReset();
});

describe('LoginPage - render', () => {
  it('renders the welcome heading, email and password fields, and the Google CTA', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });

  it('shows the Google error banner when arriving with ?error=google', () => {
    renderPage(['/login?error=google']);
    expect(screen.getByRole('alert')).toHaveTextContent(/Google login is temporarily unavailable/);
  });

  it('does NOT show the Google error banner on a clean /login arrival', () => {
    renderPage();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('LoginPage - client-side validation', () => {
  it('blocks submit and surfaces the required error when the email is empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(submitButton());
    expect(screen.getByRole('alert')).toHaveTextContent('This field is required');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('blocks submit and surfaces the invalid-email error for a malformed address', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(submitButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('blocks submit and surfaces the required error on the password when only the email is filled', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.click(submitButton());
    expect(screen.getByRole('alert')).toHaveTextContent('This field is required');
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

describe('LoginPage - submission state machine', () => {
  it('calls login with the trimmed email and navigates to /dashboard on success', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), '  maria@example.com  ');
    await user.type(screen.getByLabelText('Password'), 'mypassword');
    await user.click(submitButton());

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('maria@example.com', 'mypassword'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('redirects to the path supplied in location.state.from on success', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage([{ pathname: '/login', state: { from: { pathname: '/upload' } } }]);
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'mypassword');
    await user.click(submitButton());

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/upload', { replace: true }));
  });

  it('shows the rejection error message and does not navigate when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'badpass');
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('falls back to the generic login-failed message when the rejection is not an Error', async () => {
    mockLogin.mockRejectedValueOnce('boom');
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'badpass');
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Login failed');
    });
  });

  it('disables the submit button and shows the in-flight label while login is pending', async () => {
    let resolveLogin!: () => void;
    mockLogin.mockReturnValueOnce(new Promise<void>(resolve => { resolveLogin = resolve; }));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'mypassword');
    await user.click(submitButton());

    const pendingBtn = screen.getByRole('button', { name: 'Logging in...' });
    expect(pendingBtn).toBeDisabled();

    resolveLogin();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });
});

describe('LoginPage - Google flow', () => {
  it('invokes loginWithGoogle with no destination on a clean /login arrival', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockLoginWithGoogle).toHaveBeenCalledWith(undefined);
  });

  it('threads a safe ?redirect= destination through loginWithGoogle', async () => {
    const user = userEvent.setup();
    renderPage(['/login?redirect=/pricing']);
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(mockLoginWithGoogle).toHaveBeenCalledWith('/pricing');
  });

  it('threads a protected-route intent (location.state.from) through loginWithGoogle', async () => {
    const user = userEvent.setup();
    renderPage([{ pathname: '/login', state: { from: { pathname: '/upload' } } }]);
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(mockLoginWithGoogle).toHaveBeenCalledWith('/upload');
  });

  it('drops an unsafe ?redirect= (protocol-relative) instead of threading it', async () => {
    const user = userEvent.setup();
    renderPage(['/login?redirect=//evil.example']);
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(mockLoginWithGoogle).toHaveBeenCalledWith(undefined);
  });
});
