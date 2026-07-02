import { describe, expect, it } from 'vitest';
import { PRERENDER_PAGES } from '../prerender';

// Bing Webmaster flags meta descriptions outside ~25-160 chars as an SEO error
// ("Meta Description too long or too short"); Google truncates past ~160 in
// SERPs. Guard every prerendered page so a copy edit can't silently regress
// this again (8 pages were over 160 when Bing first audited us, 2026-07-02).
const MIN_DESCRIPTION = 25;
const MAX_DESCRIPTION = 160;

describe('prerendered meta descriptions', () => {
  const pages = Object.entries(PRERENDER_PAGES);

  it('covers every prerendered route', () => {
    expect(pages.length).toBeGreaterThanOrEqual(18);
  });

  it.each(pages)('%s description is %d-%d chars'.replace('%d-%d', `${MIN_DESCRIPTION}-${MAX_DESCRIPTION}`), (url, page) => {
    expect(
      page.description.length,
      `"${page.description}" (${page.description.length} chars) on ${url}`
    ).toBeGreaterThanOrEqual(MIN_DESCRIPTION);
    expect(
      page.description.length,
      `"${page.description}" (${page.description.length} chars) on ${url}`
    ).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });
});
