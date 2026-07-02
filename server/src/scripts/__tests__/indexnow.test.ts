import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  buildIndexNowPayload,
  parseSitemapLocs,
} from '../indexnow.js';

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://investax.app/</loc>
    <lastmod>2026-06-22</lastmod>
  </url>
  <url>
    <loc>
      https://investax.app/ghid/
    </loc>
  </url>
</urlset>`;

describe('parseSitemapLocs', () => {
  it('extracts and trims every <loc> URL', () => {
    expect(parseSitemapLocs(FIXTURE)).toEqual([
      'https://investax.app/',
      'https://investax.app/ghid/',
    ]);
  });

  it('throws when the sitemap has no <loc> entries', () => {
    expect(() => parseSitemapLocs('<urlset></urlset>')).toThrow(/no <loc> entries/);
  });

  it('throws when a <loc> is not on the production host', () => {
    const evil = FIXTURE.replace(
      'https://investax.app/ghid/',
      'https://evil.example.com/ghid/'
    );
    expect(() => parseSitemapLocs(evil)).toThrow(/not on investax\.app/);
  });
});

describe('buildIndexNowPayload', () => {
  it('builds the spec payload with host, key, keyLocation and urlList', () => {
    const payload = buildIndexNowPayload(['https://investax.app/']);
    expect(payload).toEqual({
      host: 'investax.app',
      key: INDEXNOW_KEY,
      keyLocation: `https://investax.app/${INDEXNOW_KEY}.txt`,
      urlList: ['https://investax.app/'],
    });
  });
});

describe('repo integration (real files)', () => {
  const publicDir = new URL('../../../../client/public/', import.meta.url);

  it('the served key file exists and matches INDEXNOW_KEY exactly', () => {
    const keyFile = new URL(`${INDEXNOW_KEY}.txt`, publicDir);
    expect(readFileSync(fileURLToPath(keyFile), 'utf8').trim()).toBe(INDEXNOW_KEY);
  });

  it('the real sitemap parses to on-host URLs including the homepage', () => {
    const sitemap = readFileSync(
      fileURLToPath(new URL('sitemap.xml', publicDir)),
      'utf8'
    );
    const urls = parseSitemapLocs(sitemap);
    expect(urls.length).toBeGreaterThanOrEqual(15);
    expect(urls).toContain(`https://${INDEXNOW_HOST}/`);
    for (const url of urls) {
      expect(url.startsWith(`https://${INDEXNOW_HOST}/`)).toBe(true);
    }
  });
});
