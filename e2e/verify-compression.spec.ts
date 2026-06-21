import { test, expect } from '@playwright/test';
import http from 'node:http';
import https from 'node:https';

// Production asset-compression guard (read-only).
//
// On 2026-06-21 the prod nginx was found gzipping `text/html` ONLY, shipping
// ~785 KB of `application/javascript` + `text/css` uncompressed and capping
// mobile Lighthouse performance site-wide. The fix (a `gzip_types` line for
// JS/CSS) lives in `/etc/nginx/nginx.conf` on the VPS, which is OUTSIDE this
// repo: a server rebuild could silently undo it and no per-PR CI step would
// hard-fail (the weekly audit's Lighthouse step is `continue-on-error`).
//
// This spec closes that gap. It parses the LIVE prerendered HTML for a hashed
// `/assets/*.js` and `/assets/*.css` (hashes change every deploy, so they are
// never hardcoded), re-requests each asset with `Accept-Encoding: gzip`, and
// fails if the response is not `Content-Encoding: gzip`. It is part of the
// hard-gated prod-safe suite, so a compression regression fails the weekly
// production audit instead of silently degrading perf.
//
// Prod-safe: only read-only GETs to the public site root + static assets. No
// auth, payment, upload, or admin endpoints, no writes. Listed in
// PROD_SAFE_E2E_SPECS (scripts/verify.ts) and run by `verify:prod` +
// .github/workflows/audit-weekly.yml. Reference:
// investax-docs/10-definition-of-ready.md "AUDIT FOLLOW-UP 3/3".
//
// Compression is an nginx production concern. The local Vite dev server serves
// unbundled ES modules (there is no hashed `/assets/*` bundle) and does not
// gzip, so this guard is a no-op against a local target: it auto-skips when
// BASE_URL is localhost (mirroring playwright.config.ts's `isLocalTarget`),
// which is exactly the case in the per-PR CI E2E job. It only asserts against
// the deployed site (BASE_URL=https://investax.app, set by `verify:prod`).
//
// Raw node:http/https is used deliberately instead of fetch or Playwright's
// `request` fixture: those transparently decompress gzip responses, which can
// strip or obscure the `Content-Encoding` header. node's http client never
// auto-decompresses, so the header the server actually sent is observable.

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const isLocalTarget = ['localhost', '127.0.0.1'].includes(new URL(BASE_URL).hostname);
const SKIP_REASON = `asset compression is an nginx production concern; skipped for local target ${BASE_URL}`;

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

// Single raw GET helper. Returns status + headers + the (still-encoded) body.
function rawGet(url: string, acceptEncoding: string): Promise<RawResponse> {
  const client = new URL(url).protocol === 'https:' ? https : http;
  return new Promise<RawResponse>((resolve, reject) => {
    const req = client.request(
      url,
      { method: 'GET', headers: { 'Accept-Encoding': acceptEncoding } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// Fetch the prerendered homepage once and pull out the first hashed JS + CSS
// asset paths. Memoized so the three tests share a single HTML fetch.
let assetsPromise: Promise<{ js: string; css: string }> | null = null;
function discoverAssets(): Promise<{ js: string; css: string }> {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const homeUrl = new URL('/', BASE_URL).href;
      // Ask for `identity` so nginx returns the HTML uncompressed and we can
      // parse it as text without pulling in zlib.
      const res = await rawGet(homeUrl, 'identity');
      if (res.status !== 200) {
        throw new Error(`GET ${homeUrl} returned HTTP ${res.status}, expected 200`);
      }
      const html = res.body.toString('utf8');
      const js = html.match(/\/assets\/[^"']+?\.js\b/)?.[0];
      const css = html.match(/\/assets\/[^"']+?\.css\b/)?.[0];
      if (!js) throw new Error(`No /assets/*.js reference found in prerendered HTML at ${homeUrl}`);
      if (!css) throw new Error(`No /assets/*.css reference found in prerendered HTML at ${homeUrl}`);
      return { js, css };
    })();
  }
  return assetsPromise;
}

async function expectGzip(assetPath: string, kind: 'JS' | 'CSS'): Promise<void> {
  const url = new URL(assetPath, BASE_URL).href;
  // Offer ONLY gzip so the server's choice is gzip-or-nothing, which keeps the
  // assertion exact even if brotli is added later (we never advertise `br`).
  const res = await rawGet(url, 'gzip');
  expect(res.status, `GET ${assetPath} returned HTTP ${res.status}, expected 200`).toBe(200);
  const encoding = res.headers['content-encoding'];
  expect(
    encoding,
    `${kind} asset ${assetPath} was served with Content-Encoding: ${encoding ?? '<none>'} ` +
      `(expected "gzip"). nginx likely lost gzip_types for JS/CSS on a server rebuild; ` +
      `see investax-docs/10-definition-of-ready.md "AUDIT FOLLOW-UP 3/3".`,
  ).toBe('gzip');
}

test.describe('Production asset compression (nginx gzip on JS/CSS)', () => {
  test('prerendered HTML exposes a hashed JS and CSS asset', async () => {
    test.skip(isLocalTarget, SKIP_REASON);
    const { js, css } = await discoverAssets();
    expect(js, 'expected a /assets/*.js reference').toMatch(/^\/assets\/.+\.js$/);
    expect(css, 'expected a /assets/*.css reference').toMatch(/^\/assets\/.+\.css$/);
  });

  test('served JS asset carries Content-Encoding: gzip', async () => {
    test.skip(isLocalTarget, SKIP_REASON);
    const { js } = await discoverAssets();
    await expectGzip(js, 'JS');
  });

  test('served CSS asset carries Content-Encoding: gzip', async () => {
    test.skip(isLocalTarget, SKIP_REASON);
    const { css } = await discoverAssets();
    await expectGzip(css, 'CSS');
  });
});
