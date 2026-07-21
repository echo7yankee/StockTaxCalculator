import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CookieBanner, { COOKIE_BANNER_HEIGHT_VAR } from '../CookieBanner';

// The S9 contract: while the banner is visible it must publish its real height
// (an in-flow spacer + the --cookie-banner-height var on <html>), so page
// content can always scroll clear of the fixed overlay; on dismiss everything
// is cleaned up. happy-dom neither implements ResizeObserver nor lays out, so
// both are stubbed: a controllable observer mock and a prototype-level
// offsetHeight.

let observerCallbacks: ResizeObserverCallback[];
let observedElements: Element[];
let mockedOffsetHeight: number;

class MockResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
    observerCallbacks.push(cb);
  }
  observe(el: Element) {
    observedElements.push(el);
  }
  unobserve() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;
const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetHeight',
);

beforeEach(() => {
  observerCallbacks = [];
  observedElements = [];
  mockedOffsetHeight = 120;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => mockedOffsetHeight,
  });
  localStorage.clear();
  document.documentElement.style.removeProperty(COOKIE_BANNER_HEIGHT_VAR);
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  } else {
    delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
  }
});

describe('CookieBanner (S9: published height + spacer)', () => {
  it('renders the banner with an in-flow spacer matching its measured height and publishes the CSS var', () => {
    render(<CookieBanner />);

    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    const spacer = screen.getByTestId('cookie-banner-spacer');
    expect(spacer).toHaveStyle({ height: '120px' });
    expect(spacer).toHaveAttribute('aria-hidden', 'true');
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe(
      '120px',
    );
    // The overlay (not the spacer) is what the observer tracks for re-measures.
    expect(observedElements).toContain(screen.getByTestId('cookie-banner'));
  });

  it('re-publishes height when the overlay resizes (text wrap on viewport change)', () => {
    render(<CookieBanner />);

    mockedOffsetHeight = 150;
    act(() => {
      observerCallbacks.forEach((cb) =>
        cb([] as unknown as ResizeObserverEntry[], {} as ResizeObserver),
      );
    });

    expect(screen.getByTestId('cookie-banner-spacer')).toHaveStyle({ height: '150px' });
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe(
      '150px',
    );
  });

  it('dismiss via accept removes banner, spacer and CSS var, and stores consent', async () => {
    const user = userEvent.setup();
    render(<CookieBanner />);

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cookie-banner-spacer')).not.toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe('');
    expect(localStorage.getItem('cookieConsent')).toBe('dismissed');
  });

  it('dismiss via the X close button cleans up identically', async () => {
    const user = userEvent.setup();
    render(<CookieBanner />);

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cookie-banner-spacer')).not.toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe('');
    expect(localStorage.getItem('cookieConsent')).toBe('dismissed');
  });

  it('renders nothing (no spacer, no var) when consent is already stored', () => {
    localStorage.setItem('cookieConsent', 'dismissed');
    render(<CookieBanner />);

    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cookie-banner-spacer')).not.toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe('');
  });
});
