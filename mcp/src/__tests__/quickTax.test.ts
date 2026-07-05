import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_API_BASE,
  fetchQuickTax,
  formatResult,
  resolveApiBase,
  type QuickTaxInput,
  type QuickTaxResult,
} from '../quickTax.js';

const INPUT: QuickTaxInput = {
  capitalGains: 10000,
  dividends: 2000,
  withholdingTaxPaid: 200,
  otherNonSalaryIncome: 0,
  country: 'RO',
};

const RESULT: QuickTaxResult = {
  capitalGainsTax: 1000,
  dividendTax: 0,
  healthContribution: 3300,
  bracketLabel: '6x',
  totalOwed: 4300,
  earlyFilingDiscount: 0,
  totalAfterDiscount: 4300,
  currency: 'RON',
  taxYear: 2025,
  capitalGainsTaxRate: 0.1,
  dividendTaxRate: 0.08,
  disclaimer: 'Estimare orientativa, nu consiliere fiscala. Vezi investax.app.',
  source: 'https://investax.app',
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  delete process.env.INVESTAX_API_URL;
  vi.restoreAllMocks();
});

describe('resolveApiBase', () => {
  it('defaults to the production endpoint', () => {
    expect(resolveApiBase()).toBe(DEFAULT_API_BASE);
  });

  it('honours an explicit base over the env var', () => {
    process.env.INVESTAX_API_URL = 'https://env.example/api';
    expect(resolveApiBase('https://explicit.example/api')).toBe('https://explicit.example/api');
  });

  it('reads INVESTAX_API_URL when no explicit base is given', () => {
    process.env.INVESTAX_API_URL = 'https://env.example/api';
    expect(resolveApiBase()).toBe('https://env.example/api');
  });

  it('strips trailing slashes', () => {
    expect(resolveApiBase('https://x.example/api//')).toBe('https://x.example/api');
  });
});

describe('fetchQuickTax', () => {
  it('POSTs the input as JSON to the quick-calc path and returns the parsed result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(RESULT));

    const out = await fetchQuickTax(INPUT, {
      apiBase: 'https://test.local/api',
      fetchImpl,
    });

    expect(out).toEqual(RESULT);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://test.local/api/calculator/quick');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(INPUT);
  });

  it('throws with the API error message on a non-200 JSON response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Unsupported country' }, { status: 400, statusText: 'Bad Request' }),
    );

    await expect(fetchQuickTax(INPUT, { fetchImpl })).rejects.toThrow(
      'InvesTax API returned 400 Bad Request: Unsupported country',
    );
  });

  it('throws with just the status when the error body is not JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('<html>bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(fetchQuickTax(INPUT, { fetchImpl })).rejects.toThrow(
      'InvesTax API returned 502 Bad Gateway',
    );
  });

  it('wraps a transport failure with the target URL', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      fetchQuickTax(INPUT, { apiBase: 'https://down.local/api', fetchImpl }),
    ).rejects.toThrow('Could not reach the InvesTax API at https://down.local/api/calculator/quick: ECONNREFUSED');
  });

  it('throws a clear error when no fetch implementation exists', async () => {
    const original = globalThis.fetch;
    // Simulate an ancient Node without global fetch.
    (globalThis as { fetch?: typeof fetch }).fetch = undefined;
    try {
      await expect(fetchQuickTax(INPUT)).rejects.toThrow('Node.js 18 or newer');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('formatResult', () => {
  it('renders the core lines, disclaimer and source', () => {
    const text = formatResult(RESULT);
    expect(text).toContain('fiscal year 2025');
    expect(text).toContain('Capital-gains tax (10%)');
    expect(text).toContain('Dividend tax (8%');
    expect(text).toContain('CASS health contribution (6x)');
    expect(text).toContain('Total owed');
    expect(text).toContain(RESULT.disclaimer);
    expect(text).toContain('Source: https://investax.app');
  });

  it('omits the early-filing discount lines when the discount is zero', () => {
    expect(formatResult(RESULT)).not.toContain('Early-filing discount');
  });

  it('includes the early-filing discount lines when present', () => {
    const text = formatResult({ ...RESULT, earlyFilingDiscount: 215, totalAfterDiscount: 4085 });
    expect(text).toContain('Early-filing discount');
    expect(text).toContain('Total after early-filing discount');
  });
});
