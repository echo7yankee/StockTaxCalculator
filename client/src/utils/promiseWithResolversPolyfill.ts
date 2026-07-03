/**
 * Polyfill for `Promise.withResolvers` (ES2024).
 *
 * `pdfjs-dist` v5 calls `Promise.withResolvers()` internally, on BOTH the main
 * thread and inside its web worker. That method only exists in Chrome >= 119,
 * Firefox >= 121 and Safari >= 17.4. On older browsers pdf.js threw
 * "Promise.withResolvers is not a function" before any parsing ran, which
 * silently blocked every PDF upload for customers on older devices (e.g. an
 * iPhone still on iOS < 17.4). See the 2026-07-03 incident (paying customer
 * Anda Danciu, Trading212 PDF).
 *
 * This is a side-effect module: importing it installs the shim on the current
 * realm's `Promise` if (and only if) it is missing, so it is a no-op on modern
 * browsers. It must be imported before pdf.js in every scope that runs pdf.js
 * code: the main thread (see main.tsx / pdfExtractor.ts) and the worker
 * (see pdfWorker.ts).
 */
type PromiseWithResolvers = <T>() => {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

interface PromiseCtorMaybePolyfilled {
  withResolvers?: PromiseWithResolvers;
}

// Marks this side-effect-only file as an ES module so `import './...'` resolves
// it as a module rather than a global script.
export {};

const ctor = Promise as unknown as PromiseCtorMaybePolyfilled;

if (typeof ctor.withResolvers !== 'function') {
  ctor.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
