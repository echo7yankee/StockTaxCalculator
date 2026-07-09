import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../AuthContext';

// AuthProvider checks the session on mount; a null-user response keeps these tests
// anonymous and offline.
const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ user: null }),
} as unknown as Response);

// The provider's Google entry assigns window.location.href, which the test DOM
// would treat as a real navigation. Swap in a plain writable stub and restore after.
const realLocation = window.location;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'location', {
    value: realLocation,
    writable: true,
    configurable: true,
  });
});

function GoogleButton({ redirect }: { redirect?: string }) {
  const { loginWithGoogle } = useAuth();
  return <button onClick={() => loginWithGoogle(redirect)}>google</button>;
}

async function clickGoogle(redirect?: string) {
  const user = userEvent.setup();
  render(
    <AuthProvider>
      <GoogleButton redirect={redirect} />
    </AuthProvider>
  );
  // Let the mount-time /api/auth/me check settle before interacting.
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'google' }));
}

describe('AuthContext.loginWithGoogle', () => {
  it('navigates to the bare OAuth entry when no redirect is given', async () => {
    await clickGoogle();
    expect(window.location.href).toBe('/api/auth/google');
  });

  it('appends the redirect as a URL-encoded query param', async () => {
    await clickGoogle('/pricing');
    expect(window.location.href).toBe('/api/auth/google?redirect=%2Fpricing');
  });

  it('encodes redirect paths that carry their own query string', async () => {
    await clickGoogle('/pricing?from=checker');
    expect(window.location.href).toBe(
      '/api/auth/google?redirect=%2Fpricing%3Ffrom%3Dchecker'
    );
  });
});
