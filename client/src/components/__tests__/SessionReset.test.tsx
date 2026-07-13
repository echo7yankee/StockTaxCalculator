import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UploadProvider, useUpload } from '../../contexts/UploadContext';
import SessionReset from '../SessionReset';
import { writePendingParse, readPendingParse } from '../../lib/pendingParse';
import type { PdfParseResult } from '@shared/parsers/trading212Pdf';

// SessionReset watches the auth user; drive it via a mutable module variable so a
// rerender can flip the login state (non-null -> null == logout).
let mockUser: { id: string } | null = null;
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

function seedPendingParse() {
  const pdf = {
    year: 2025,
    overview: { currency: 'USD', closedResult: 1000, taxWithheld: 0 },
    sellTrades: [{ ticker: 'AAPL', isin: 'US0378331005', executionTime: '2025-06-01' }],
    dividends: [],
    distributions: [],
    warnings: [],
  } as unknown as PdfParseResult;
  writePendingParse({ fileType: 'pdf', fileName: 'annual-statement-2025.pdf', pdf });
}

function Probe() {
  const { fileName, setUploadData } = useUpload();
  return (
    <div>
      <span data-testid="filename">{fileName}</span>
      <button onClick={() => setUploadData({ fileName: 'statement.pdf' })}>seed-upload</button>
    </div>
  );
}

function renderTree() {
  return render(
    <UploadProvider>
      <SessionReset />
      <Probe />
    </UploadProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockUser = null;
});

describe('SessionReset', () => {
  it('clears the upload context + pending parse on a logged-in -> logged-out transition', () => {
    mockUser = { id: 'u1' };
    const { rerender } = renderTree();

    // A logged-in user runs a calc: seed the upload context + the stashed parse.
    fireEvent.click(screen.getByText('seed-upload'));
    seedPendingParse();
    expect(screen.getByTestId('filename')).toHaveTextContent('statement.pdf');
    expect(readPendingParse()).not.toBeNull();

    // Log out: user goes non-null -> null.
    mockUser = null;
    rerender(
      <UploadProvider>
        <SessionReset />
        <Probe />
      </UploadProvider>
    );

    // Both traces are gone, so the next person on a shared machine sees nothing.
    expect(screen.getByTestId('filename')).toHaveTextContent('');
    expect(readPendingParse()).toBeNull();
  });

  it('does NOT wipe an anonymous in-progress flow (null -> null never clears)', () => {
    mockUser = null;
    const { rerender } = renderTree();

    // Anonymous free-checker progress: seed some in-progress state.
    fireEvent.click(screen.getByText('seed-upload'));
    seedPendingParse();
    expect(screen.getByTestId('filename')).toHaveTextContent('statement.pdf');

    // A re-render while still anonymous must not clear the in-progress flow.
    rerender(
      <UploadProvider>
        <SessionReset />
        <Probe />
      </UploadProvider>
    );

    expect(screen.getByTestId('filename')).toHaveTextContent('statement.pdf');
    expect(readPendingParse()).not.toBeNull();
  });

  it('does NOT clear on the initial login (null -> user) transition', () => {
    mockUser = null;
    const { rerender } = renderTree();

    fireEvent.click(screen.getByText('seed-upload'));
    expect(screen.getByTestId('filename')).toHaveTextContent('statement.pdf');

    // Logging in (null -> user) is not a logout; the in-progress parse survives.
    mockUser = { id: 'u1' };
    rerender(
      <UploadProvider>
        <SessionReset />
        <Probe />
      </UploadProvider>
    );

    expect(screen.getByTestId('filename')).toHaveTextContent('statement.pdf');
  });
});
