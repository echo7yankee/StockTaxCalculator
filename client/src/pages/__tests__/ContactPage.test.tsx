import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ContactPage from '../ContactPage';

const VALID_MESSAGE = 'I have a question about my Trading 212 statement.';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function submitButton() {
  return screen.getByRole('button', { name: /send message/i });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), 'Maria Popescu');
  await user.type(screen.getByLabelText('Your email address'), 'maria@example.com');
  await user.type(screen.getByLabelText('Your message'), VALID_MESSAGE);
}

describe('ContactPage - validation gating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the submit button for an empty form', () => {
    renderPage();
    expect(submitButton()).toBeDisabled();
  });

  it('keeps submit disabled while the message is shorter than 10 characters', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Your name'), 'Maria Popescu');
    await user.type(screen.getByLabelText('Your email address'), 'maria@example.com');
    await user.type(screen.getByLabelText('Your message'), 'help');
    expect(submitButton()).toBeDisabled();
  });

  it('keeps submit disabled when the email is malformed', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Your name'), 'Maria Popescu');
    await user.type(screen.getByLabelText('Your email address'), 'maria.example.com');
    await user.type(screen.getByLabelText('Your message'), VALID_MESSAGE);
    expect(submitButton()).toBeDisabled();
  });

  it('keeps submit disabled when the name is only whitespace', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Your name'), '   ');
    await user.type(screen.getByLabelText('Your email address'), 'maria@example.com');
    await user.type(screen.getByLabelText('Your message'), VALID_MESSAGE);
    expect(submitButton()).toBeDisabled();
  });

  it('enables the submit button once name, a valid email, and a 10+ character message are present', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    expect(submitButton()).toBeEnabled();
  });
});

describe('ContactPage - submission state machine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the confirmation panel and hides the form after a successful submit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByText('Message sent!')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('posts the trimmed form payload to /api/contact', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Your name'), '  Maria Popescu  ');
    await user.type(screen.getByLabelText('Your email address'), 'maria@example.com');
    await user.selectOptions(screen.getByLabelText('Topic'), 'business');
    await user.type(screen.getByLabelText('Your message'), `  ${VALID_MESSAGE}  `);
    await user.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/contact');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({
      name: 'Maria Popescu',
      email: 'maria@example.com',
      topic: 'business',
      message: VALID_MESSAGE,
      language: 'en',
    });
  });

  it('returns the form to the idle state when "send another message" is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());
    await waitFor(() => {
      expect(screen.getByText('Message sent!')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /send another message/i }));

    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.queryByText('Message sent!')).not.toBeInTheDocument();
  });

  it('clears the input fields after a successful submit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());
    await waitFor(() => {
      expect(screen.getByText('Message sent!')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /send another message/i }));
    expect(screen.getByLabelText('Your name')).toHaveValue('');
    expect(screen.getByLabelText('Your email address')).toHaveValue('');
    expect(screen.getByLabelText('Your message')).toHaveValue('');
  });

  it('disables the submit button and shows a sending state while the request is in flight', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(pending);
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    const sendingButton = screen.getByRole('button', { name: /sending/i });
    expect(sendingButton).toBeDisabled();

    resolveFetch(new Response('{}', { status: 200 }));
    await waitFor(() => {
      expect(screen.getByText('Message sent!')).toBeInTheDocument();
    });
  });
});

describe('ContactPage - error mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the rate-limit message when the server responds 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 429 }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/sent too many messages/i);
    });
  });

  it('shows the generic error when the server responds with a non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be sent/i);
    });
  });

  it('marks the offending field when the server returns a field error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ field: 'email' }), { status: 400 })
    );
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be sent/i);
    });
    expect(screen.getByLabelText('Your email address')).toHaveClass('border-red-500');
    expect(screen.getByLabelText('Your name')).not.toHaveClass('border-red-500');
  });

  it('shows the network error when the request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/connection interrupted/i);
    });
  });
});
