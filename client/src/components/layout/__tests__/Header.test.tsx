import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mocks for the two contexts the Header consumes. These need to be re-assignable
// per test so we can simulate auth.loading=true vs auth.loading=false.
const mockAuth = {
  user: null as null | { id: string; email: string; name: string | null; plan: string; isAdmin: boolean },
  loading: true,
  login: vi.fn(),
  signup: vi.fn(),
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
  deleteAccount: vi.fn(),
  exportData: vi.fn(),
};

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

import Header from '../Header';

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );
}

describe('Header — Section 3.9 Site 1+4 (auth skeleton)', () => {
  beforeEach(() => {
    mockAuth.user = null;
    mockAuth.loading = true;
  });

  it('renders the auth-cluster skeleton while auth is loading and hides login/sign-up links', () => {
    mockAuth.loading = true;
    mockAuth.user = null;
    renderHeader();

    const skeleton = screen.getByTestId('header-auth-skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton).toHaveAttribute('role', 'status');
    // sr-only label routes through i18n (no hardcoded English text leak)
    expect(skeleton).toHaveTextContent('Loading account');

    // While loading, the real auth links must NOT be in the DOM (otherwise the jump returns).
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('replaces the skeleton with login/sign-up links once auth resolves to unauthenticated', () => {
    mockAuth.loading = false;
    mockAuth.user = null;
    renderHeader();

    expect(screen.queryByTestId('header-auth-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });
});

describe('Header admin analytics link (ADMIN_EMAILS gating)', () => {
  beforeEach(() => {
    mockAuth.loading = false;
  });

  it('shows the admin Analytics link for an admin user, pointing at /admin/analytics', () => {
    mockAuth.user = { id: '1', email: 'admin@investax.app', name: 'Admin', plan: 'free', isAdmin: true };
    renderHeader();

    const link = screen.getByRole('link', { name: 'Analytics' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/admin/analytics');
  });

  it('hides the admin Analytics link for a non-admin user', () => {
    mockAuth.user = { id: '2', email: 'paul@example.com', name: 'Paul', plan: 'paid', isAdmin: false };
    renderHeader();

    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
  });

  it('hides the admin Analytics link when logged out', () => {
    mockAuth.user = null;
    renderHeader();

    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
  });
});
