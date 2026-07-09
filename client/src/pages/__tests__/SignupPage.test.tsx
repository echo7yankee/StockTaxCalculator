import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ApiError } from '../../contexts/AuthContext';

const mockNavigate = vi.fn();
const mockSignup = vi.fn();
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
      login: vi.fn(),
      signup: mockSignup,
      loginWithGoogle: mockLoginWithGoogle,
      logout: vi.fn(),
      deleteAccount: vi.fn(),
      exportData: vi.fn(),
    }),
  };
});

import SignupPage from '../SignupPage';

const VALID_PASSWORD = 'TestPass2026!';

function renderPage(initialEntries: string[] = ['/signup']) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <SignupPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function submitButton() {
  return screen.getByRole('button', { name: 'Create your account' });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'Maria Popescu');
  await user.type(screen.getByLabelText('Email'), 'maria@example.com');
  await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
  await user.type(screen.getByLabelText('Repeat your password'), VALID_PASSWORD);
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockSignup.mockReset();
  mockLoginWithGoogle.mockReset();
});

describe('SignupPage - render', () => {
  it('renders all fields, the primary CTA, and the Google CTA', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Repeat your password')).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });
});

describe('SignupPage - client-side validation', () => {
  it('blocks submit and shows the required error on an empty form', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(submitButton());
    expect(screen.getAllByText('This field is required').length).toBeGreaterThan(0);
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('rejects a malformed email address', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Repeat your password'), VALID_PASSWORD);
    await user.click(submitButton());
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Repeat your password'), 'short');
    await user.click(submitButton());
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('rejects a password from the common-password blocklist', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Repeat your password'), 'password123');
    await user.click(submitButton());
    expect(screen.getByText(/This password is too common/)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('rejects a confirm-password value that does not match', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Email'), 'maria@example.com');
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Repeat your password'), 'DifferentPass1!');
    await user.click(submitButton());
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });
});

describe('SignupPage - submission state machine', () => {
  it('calls signup with trimmed email + name and navigates to /dashboard on success', async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Name'), '  Maria Popescu  ');
    await user.type(screen.getByLabelText('Email'), '  maria@example.com  ');
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    await user.type(screen.getByLabelText('Repeat your password'), VALID_PASSWORD);
    await user.click(submitButton());

    await waitFor(() =>
      expect(mockSignup).toHaveBeenCalledWith('maria@example.com', VALID_PASSWORD, 'Maria Popescu')
    );
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('maps ApiError.fields to per-field error messages', async () => {
    mockSignup.mockRejectedValueOnce(new ApiError('Email already registered', { email: 'Already taken' }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByText('Already taken')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows the rejection message in an alert when ApiError has no field map', async () => {
    mockSignup.mockRejectedValueOnce(new Error('Signup blocked'));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Signup blocked');
    });
  });

  it('disables the submit button and shows the in-flight label while signup is pending', async () => {
    let resolveSignup!: () => void;
    mockSignup.mockReturnValueOnce(new Promise<void>(resolve => { resolveSignup = resolve; }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    const pendingBtn = screen.getByRole('button', { name: 'Creating account...' });
    expect(pendingBtn).toBeDisabled();

    resolveSignup();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });
});

describe('SignupPage - Google flow', () => {
  it('invokes loginWithGoogle with no destination on a clean /signup arrival', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockLoginWithGoogle).toHaveBeenCalledWith(undefined);
  });

  it('threads a safe ?redirect= destination through loginWithGoogle', async () => {
    const user = userEvent.setup();
    renderPage(['/signup?redirect=/pricing']);
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(mockLoginWithGoogle).toHaveBeenCalledWith('/pricing');
  });

  it('drops an unsafe ?redirect= (protocol-relative) instead of threading it', async () => {
    const user = userEvent.setup();
    renderPage(['/signup?redirect=//evil.example']);
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(mockLoginWithGoogle).toHaveBeenCalledWith(undefined);
  });
});
