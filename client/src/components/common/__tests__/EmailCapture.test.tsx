import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EmailCapture, { type SubscribeTopic } from '../EmailCapture';

function renderCapture(props?: Partial<{ topic: SubscribeTopic; variant: 'filing' | 'broker'; source: string }>) {
  return render(
    <MemoryRouter>
      <EmailCapture
        topic={props?.topic ?? 'filing_reminder'}
        variant={props?.variant ?? 'filing'}
        source={props?.source}
      />
    </MemoryRouter>
  );
}

const emailInput = () => screen.getByLabelText('your email address');
const notifyButton = () => screen.getByRole('button', { name: /notify me/i });

describe('EmailCapture - gating + variants', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the filing-reminder copy by default with the submit disabled', () => {
    renderCapture();
    expect(screen.getByText(/remind you for the 2026 filing/i)).toBeInTheDocument();
    expect(notifyButton()).toBeDisabled();
  });

  it('renders the broker-waitlist copy for the broker variant', () => {
    renderCapture({ topic: 'broker_revolut', variant: 'broker' });
    expect(screen.getByText(/get notified when it leaves beta/i)).toBeInTheDocument();
  });

  it('enables the submit button once a valid email is entered', async () => {
    const user = userEvent.setup();
    renderCapture();
    await user.type(emailInput(), 'maria@example.com');
    expect(notifyButton()).toBeEnabled();
  });

  it('keeps the submit disabled for a malformed email', async () => {
    const user = userEvent.setup();
    renderCapture();
    await user.type(emailInput(), 'maria.example.com');
    expect(notifyButton()).toBeDisabled();
  });
});

describe('EmailCapture - submission', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the trimmed payload (with topic, language, source, empty honeypot) to /api/subscribe', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const user = userEvent.setup();
    renderCapture({ topic: 'filing_reminder', variant: 'filing', source: 'calculator' });

    await user.type(emailInput(), '  maria@example.com  ');
    await user.click(notifyButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/subscribe');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({
      email: 'maria@example.com',
      topic: 'filing_reminder',
      language: 'en',
      source: 'calculator',
      website: '',
    });
  });

  it('shows the confirmation state after a successful submit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const user = userEvent.setup();
    renderCapture();
    await user.type(emailInput(), 'maria@example.com');
    await user.click(notifyButton());

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    // The form (and its email field) is replaced by the success panel.
    expect(screen.queryByLabelText('your email address')).not.toBeInTheDocument();
  });

  it('shows the rate-limit message on 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 429 }));
    const user = userEvent.setup();
    renderCapture();
    await user.type(emailInput(), 'maria@example.com');
    await user.click(notifyButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many requests/i);
    });
  });

  it('shows the generic error on a non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const user = userEvent.setup();
    renderCapture();
    await user.type(emailInput(), 'maria@example.com');
    await user.click(notifyButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't process/i);
    });
  });

  it('shows the network error when the request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderCapture();
    await user.type(emailInput(), 'maria@example.com');
    await user.click(notifyButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/connection lost/i);
    });
  });
});
