// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { prerender } from '../../prerender';

/**
 * SEO regression guard: internal links must point straight at the trailing-slash
 * canonical so Googlebot does not get bounced through an nginx 301 (no-slash -> slash)
 * on every internal hop. The canonical URLs and the sitemap use the trailing-slash form,
 * so the prerendered HTML must emit trailing-slash hrefs for the scoped indexable routes.
 *
 * If a future edit reintroduces a no-slash internal link (e.g. to="/ghid/cass-investitii"),
 * the prerendered href becomes /ghid/cass-investitii and these assertions fail.
 */

// Routes that are prerendered + indexable and whose canonical is the trailing-slash form.
// The homepage link "/" is canonical as-is and is intentionally excluded.
const SCOPED_TRAILING_SLASH_HREFS = [
  '/pricing/',
  '/calculator/',
  '/ghid/',
  '/ghid/cass-investitii/',
  '/ghid/dividende-broker-strain/',
  '/ghid/cum-calculam/',
  '/ghid/declaratie-unica-trading212/',
  '/ghid/declaratie-unica-revolut/',
  '/ghid/declaratie-unica-ibkr/',
  '/ghid/cum-completez-declaratia-unica/',
  '/ghid/notificare-anaf-venituri-strainatate/',
  '/ghid/impozit-xtb/',
];

// Pull out every internal app href (those that start with "/", excluding the protocol-
// relative and absolute ones) from the prerendered HTML body.
function internalHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const re = /href="(\/[^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    hrefs.push(m[1]);
  }
  return hrefs;
}

describe('internal links point at the trailing-slash canonical (SSR, no 301 hop)', () => {
  it('homepage emits trailing-slash hrefs for the scoped routes it links to', async () => {
    const out = await prerender({ url: '/' });
    const hrefs = internalHrefs(out.html);

    // The homepage links the calculator, the /ghid hub, and every guide card; the
    // scoped routes it surfaces must all carry the trailing slash. Since the pre-pay
    // parse gate (backlog #24B Phase 2, PR-3) the anonymous primary CTA routes through
    // the free checker (/verifica-extras, a noindex route), not straight to /pricing/,
    // so the homepage no longer emits a direct /pricing/ link (the /ghid hub + spoke
    // pages still do, asserted below). The trailing-slash guard for any /pricing/ link
    // that IS present is unaffected.
    expect(hrefs).toContain('/calculator/');
    expect(hrefs).toContain('/ghid/');
    for (const guide of SCOPED_TRAILING_SLASH_HREFS) {
      if (guide.startsWith('/ghid/') && guide !== '/ghid/') {
        expect(hrefs, `homepage missing trailing-slash guide link ${guide}`).toContain(guide);
      }
    }
  });

  it('/ghid hub emits trailing-slash hrefs for every guide card + the calculator/pricing CTAs', async () => {
    const out = await prerender({ url: '/ghid' });
    const hrefs = internalHrefs(out.html);

    for (const href of SCOPED_TRAILING_SLASH_HREFS) {
      if (href === '/ghid/') continue; // the hub does not self-link
      expect(hrefs, `/ghid hub missing trailing-slash href ${href}`).toContain(href);
    }
  });

  it('a ghid spoke page (cass) emits trailing-slash internal hrefs and no no-slash variant', async () => {
    const out = await prerender({ url: '/ghid/cass-investitii' });
    const hrefs = internalHrefs(out.html);

    // CTAs + related guides on the spoke page must be trailing-slash.
    expect(hrefs).toContain('/calculator/');
    expect(hrefs).toContain('/pricing/');
    expect(hrefs).toContain('/ghid/'); // back-to-all-guides

    // None of the scoped routes may appear in their no-slash form anywhere in the HTML.
    for (const slashed of SCOPED_TRAILING_SLASH_HREFS) {
      const noSlash = slashed.slice(0, -1);
      expect(
        hrefs,
        `no-slash internal link ${noSlash} would force a 301 redirect hop`,
      ).not.toContain(noSlash);
    }
  });

  it('no internal href contains a // double-slash artifact', async () => {
    for (const url of ['/', '/ghid', '/ghid/cass-investitii', '/pricing', '/calculator']) {
      const out = await prerender({ url });
      for (const href of internalHrefs(out.html)) {
        expect(href.includes('//'), `double-slash in ${href} on ${url}`).toBe(false);
      }
    }
  });
});
