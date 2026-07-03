/**
 * Worker entry for pdfjs-dist.
 *
 * Vite bundles this file (imported via `./pdfWorker?worker`) as the pdf.js web
 * worker. The polyfill import MUST come first so `Promise.withResolvers` exists
 * in the worker's own global scope before the pdf.js worker code (which calls
 * it) evaluates. Importing the worker module for its side effects registers its
 * `onmessage` handlers in this worker. See promiseWithResolversPolyfill.ts for
 * the why (2026-07-03 old-browser PDF-upload incident).
 */
import './promiseWithResolversPolyfill';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
