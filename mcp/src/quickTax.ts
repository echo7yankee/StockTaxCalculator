// Thin client for the InvesTax free quick-calc endpoint.
//
// MOAT BOUNDARY (do not cross): this wraps ONLY the public, free
// `POST /api/calculator/quick` (the same manual estimate as the in-app
// calculator and the embed widget). The paid moat, real broker-statement
// parsing and Declaratia Unica generation, is NEVER called or exposed here.
// See server/src/routes/calculator.ts and llms.txt.

/** Manual figures the caller supplies, all amounts in RON. */
export interface QuickTaxInput {
  capitalGains: number;
  dividends: number;
  withholdingTaxPaid: number;
  otherNonSalaryIncome: number;
  country: string;
}

/** The deterministic estimate returned by the endpoint. Mirrors openapi.json. */
export interface QuickTaxResult {
  capitalGainsTax: number;
  dividendTax: number;
  healthContribution: number;
  bracketLabel: string;
  totalOwed: number;
  earlyFilingDiscount: number;
  totalAfterDiscount: number;
  currency: string;
  taxYear: number;
  capitalGainsTaxRate: number;
  dividendTaxRate: number;
  disclaimer: string;
  source: string;
}

/** Default production API base. Override with INVESTAX_API_URL (used by tests). */
export const DEFAULT_API_BASE = 'https://investax.app/api';

export interface FetchOptions {
  /** API base URL, without a trailing slash. Defaults to the prod endpoint. */
  apiBase?: string;
  /** Injected fetch, for tests. Defaults to the global fetch (Node >= 18). */
  fetchImpl?: typeof fetch;
}

export function resolveApiBase(explicit?: string): string {
  const base = explicit ?? process.env.INVESTAX_API_URL ?? DEFAULT_API_BASE;
  return base.replace(/\/+$/, '');
}

/**
 * Call the free quick-calc endpoint and return the parsed estimate.
 * Throws an Error with a caller-friendly message on transport or HTTP failure.
 */
export async function fetchQuickTax(
  input: QuickTaxInput,
  options: FetchOptions = {},
): Promise<QuickTaxResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'No fetch implementation available. InvesTax MCP requires Node.js 18 or newer.',
    );
  }

  const url = `${resolveApiBase(options.apiBase)}/calculator/quick`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach the InvesTax API at ${url}: ${detail}`);
  }

  if (!response.ok) {
    let apiMessage = '';
    try {
      const body = (await response.json()) as { error?: string };
      apiMessage = body?.error ? `: ${body.error}` : '';
    } catch {
      // Non-JSON error body; fall through with just the status.
    }
    throw new Error(
      `InvesTax API returned ${response.status} ${response.statusText}${apiMessage}`,
    );
  }

  return (await response.json()) as QuickTaxResult;
}

/** Render the estimate as a compact, human-readable summary for the LLM/agent. */
export function formatResult(result: QuickTaxResult): string {
  const money = (n: number) =>
    `${n.toLocaleString('ro-RO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${result.currency}`;
  const pct = (r: number) => `${(r * 100).toFixed(0)}%`;

  const lines = [
    `Estimated Romanian investment tax for fiscal year ${result.taxYear}:`,
    `- Capital-gains tax (${pct(result.capitalGainsTaxRate)}): ${money(result.capitalGainsTax)}`,
    `- Dividend tax (${pct(result.dividendTaxRate)}, net of foreign withholding credit): ${money(result.dividendTax)}`,
    `- CASS health contribution (${result.bracketLabel}): ${money(result.healthContribution)}`,
    `- Total owed: ${money(result.totalOwed)}`,
  ];
  if (result.earlyFilingDiscount > 0) {
    lines.push(
      `- Early-filing discount: -${money(result.earlyFilingDiscount)}`,
      `- Total after early-filing discount: ${money(result.totalAfterDiscount)}`,
    );
  }
  lines.push('', result.disclaimer, `Source: ${result.source}`);
  return lines.join('\n');
}
