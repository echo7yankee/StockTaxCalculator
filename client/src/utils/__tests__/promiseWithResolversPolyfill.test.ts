import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// The polyfill is a side-effect module that patches the global Promise. To
// exercise the "old browser" branch we delete the native method, then re-import
// the module with a fresh module registry so its top-level code runs again.
type PromiseCtor = typeof Promise & { withResolvers?: unknown };

describe('promiseWithResolversPolyfill', () => {
  const ctor = Promise as PromiseCtor;
  const original = ctor.withResolvers;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore whatever the environment had so other suites are unaffected.
    if (original === undefined) {
      delete ctor.withResolvers;
    } else {
      ctor.withResolvers = original;
    }
  });

  it('installs a working Promise.withResolvers when missing', async () => {
    delete ctor.withResolvers;
    expect(typeof ctor.withResolvers).toBe('undefined');

    await import('../promiseWithResolversPolyfill');

    expect(typeof ctor.withResolvers).toBe('function');

    const wr = (ctor.withResolvers as <T>() => {
      promise: Promise<T>;
      resolve: (v: T) => void;
      reject: (r?: unknown) => void;
    })<string>();

    wr.resolve('ok');
    await expect(wr.promise).resolves.toBe('ok');
  });

  it('rejects through the polyfilled deferred', async () => {
    delete ctor.withResolvers;
    await import('../promiseWithResolversPolyfill');

    const wr = (ctor.withResolvers as <T>() => {
      promise: Promise<T>;
      resolve: (v: T) => void;
      reject: (r?: unknown) => void;
    })<never>();

    wr.reject(new Error('boom'));
    await expect(wr.promise).rejects.toThrow('boom');
  });

  it('does not overwrite a native implementation when present', async () => {
    const sentinel = function withResolvers() {
      return { promise: Promise.resolve(), resolve() {}, reject() {} };
    };
    ctor.withResolvers = sentinel;

    await import('../promiseWithResolversPolyfill');

    expect(ctor.withResolvers).toBe(sentinel);
  });
});
