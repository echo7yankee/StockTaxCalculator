// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { prerender } from '../../prerender';

type HeadElement = { type: string; props: Record<string, string> };
const robotsOf = (head: { elements: Set<HeadElement> } | undefined) =>
  [...(head?.elements ?? [])].find((e) => e.props.name === 'robots');

describe('embed pages prerender (SSR)', () => {
  it('prerenders the widget shell server-side with a noindex robots directive', async () => {
    const out = await prerender({ url: '/embed/calculator' });
    expect(out.html).toContain('embed-calc-cg'); // the calculator renders without JS
    expect(robotsOf(out.head)?.props.content).toBe('noindex, follow');
  });

  it('prerenders the /embed landing as indexable (no robots) with the embed snippet', async () => {
    const out = await prerender({ url: '/embed' });
    expect(out.html).toContain('investax.app/embed/calculator'); // the snippet
    expect(out.html).toContain('Calculator oferit de'); // the attribution copy
    expect(robotsOf(out.head)).toBeUndefined();
  });

  it('does not leak a 2026 / 16% rate into either embed page (RO 2025 scoping)', async () => {
    const widget = await prerender({ url: '/embed/calculator' });
    const landing = await prerender({ url: '/embed' });
    expect(widget.html).not.toContain('16%');
    expect(landing.html).not.toContain('16%');
  });

  it('confirms no browser globals leak into the SSR scope', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });
});
