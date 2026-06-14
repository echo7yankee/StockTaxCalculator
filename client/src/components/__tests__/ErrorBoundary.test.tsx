import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// Mock the error monitor so the boundary's componentDidCatch is observable
// without firing a real beacon.
const reportClientError = vi.fn();
vi.mock('../../lib/errorMonitor', () => ({
  reportClientError: (...args: unknown[]) => reportClientError(...args),
}));

function Boom(): never {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    reportClientError.mockClear();
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders its children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders the fallback and reports the error when a child throws', () => {
    // React logs the caught error to console.error; silence it for clean output.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    // Default language is ro (no localStorage, no document lang).
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Ceva nu a mers bine. Reincarca pagina.')).toBeInTheDocument();

    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError.mock.calls[0][0]).toMatchObject({
      name: 'Error',
      message: 'render exploded',
      context: 'react-render',
    });
    errSpy.mockRestore();
  });

  it('shows the English fallback when the persisted language is en', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('language', 'en');
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong. Please reload the page.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('reloads the page when the reload button is clicked', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    errSpy.mockRestore();
  });
});
