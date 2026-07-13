import { XMLParser } from 'fast-xml-parser';

export interface BnrRate {
  date: string;
  currency: string;
  rate: number;
}

export interface BnrYearRates {
  year: number;
  rates: BnrRate[];
}

interface CacheEntry {
  data: BnrYearRates;
  /** Epoch ms (from nowProvider) when this entry was fetched. */
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

// The in-progress (current) year's BNR XML keeps growing as BNR publishes each
// business day, so a snapshot taken mid-year is partial. A long-lived pm2
// process must not serve that partial snapshot forever, or getRateForDate (the
// on-or-before scan) and getAverageRate would silently return stale/incomplete
// data. Completed PAST years are final and cached permanently; the current (and
// any future) year gets this short TTL so it is periodically re-fetched.
const CURRENT_YEAR_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Injectable clock so the cache-freshness and completed-year logic is testable
// without touching the wall clock. Production uses Date.now(); tests pin it.
let nowProvider: () => number = () => Date.now();

/**
 * Test-only seam: pin the internal clock (epoch ms) so the current-year TTL and
 * the completed-year guard can be exercised deterministically. Pass null to
 * restore the real clock. Not used in production code.
 */
export function setNowProviderForTesting(fn: (() => number) | null): void {
  nowProvider = fn ?? (() => Date.now());
}

function currentYear(): number {
  return new Date(nowProvider()).getUTCFullYear();
}

// A cached entry is fresh if it is a completed past year (final XML, cache
// forever) or a current/future year fetched within the TTL window.
function isCacheEntryFresh(year: number, fetchedAt: number): boolean {
  if (year < currentYear()) return true;
  return nowProvider() - fetchedAt < CURRENT_YEAR_TTL_MS;
}

function buildUrl(year: number): string {
  return `https://www.bnr.ro/files/xml/years/nbrfxrates${year}.xml`;
}

export function parseRatesXml(xml: string, currency: string): BnrRate[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const doc = parser.parse(xml);
  const rates: BnrRate[] = [];

  // BNR XML structure: DataSet > Body > Cube[] (each has @_date)
  // Inside each Cube: Rate[] (each has @_currency and text value)
  const body = doc?.DataSet?.Body;
  if (!body) return rates;

  const cubes = Array.isArray(body.Cube) ? body.Cube : [body.Cube];
  for (const cube of cubes) {
    if (!cube || !cube['@_date']) continue;

    const date = cube['@_date'];
    const rateEntries = Array.isArray(cube.Rate) ? cube.Rate : [cube.Rate];

    for (const entry of rateEntries) {
      if (!entry) continue;
      const cur = entry['@_currency'];
      if (cur !== currency) continue;

      // Value can be text content or #text if multiplier is present
      const value = typeof entry === 'object' ? (entry['#text'] ?? entry) : entry;
      const multiplier = entry['@_multiplier'] ? parseInt(entry['@_multiplier']) : 1;
      const rate = parseFloat(String(value)) / multiplier;

      if (!isNaN(rate)) {
        rates.push({ date, currency: cur, rate });
      }
    }
  }

  return rates;
}

export async function fetchBnrRatesForYear(year: number, currency: string = 'USD'): Promise<BnrYearRates> {
  const cacheKey = `${year}-${currency}`;
  const cached = cache.get(cacheKey);
  if (cached && isCacheEntryFresh(year, cached.fetchedAt)) {
    return cached.data;
  }

  const url = buildUrl(year);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'Accept': 'application/xml' },
  });

  if (!response.ok) {
    throw new Error(`BNR API returned ${response.status} for year ${year}`);
  }

  const xml = await response.text();
  const rates = parseRatesXml(xml, currency);

  if (rates.length === 0) {
    throw new Error(`No ${currency} rates found in BNR data for ${year}`);
  }

  const result: BnrYearRates = { year, rates };
  cache.set(cacheKey, { data: result, fetchedAt: nowProvider() });
  return result;
}

export async function getAverageRate(year: number, currency: string = 'USD'): Promise<number> {
  // Completed-year guard: the "curs mediu anual" (art. 131 alin. 6) is the mean
  // of the 12 MONTHLY averages of a fully-elapsed year. For the current (or a
  // future) year, BNR has not published a full 12-month series yet, so
  // averaging whatever months exist so far would return a partial-year figure
  // dressed up as the authoritative annual rate. Refuse it rather than mislead.
  if (year >= currentYear()) {
    throw new Error(
      `Annual average for ${year} is not available: the year is not complete. ` +
        `The BNR "curs mediu anual" (art. 131) requires a fully-elapsed year; ` +
        `request it once ${year} has ended.`
    );
  }

  const { rates } = await fetchBnrRatesForYear(year, currency);
  // BNR's official "curs mediu anual", the rate art. 131 alin. (6) requires for
  // converting foreign-source dividends, is the arithmetic mean of the 12 MONTHLY
  // averages, NOT the mean of every daily rate. The two differ because months have
  // different counts of business days, so a flat daily mean over-weights busier
  // months. Group by calendar month, average each month, then average those means.
  // Verified against BNR's published 2025 annual figures (USD 4.4705, EUR 5.0415);
  // a flat daily mean gives 4.4645 / 5.0431, which is what this used to wrongly return.
  const monthly = new Map<string, { sum: number; count: number }>();
  for (const r of rates) {
    const month = r.date.slice(0, 7); // 'YYYY-MM'
    const bucket = monthly.get(month) ?? { sum: 0, count: 0 };
    bucket.sum += r.rate;
    bucket.count += 1;
    monthly.set(month, bucket);
  }
  const monthlyAverages = [...monthly.values()].map((b) => b.sum / b.count);
  const annual = monthlyAverages.reduce((s, a) => s + a, 0) / monthlyAverages.length;
  return Math.round(annual * 10000) / 10000;
}

/**
 * Returns the prior year's final published rate for a currency, or null when the
 * prior year's data is unavailable (e.g. before BNR's earliest XML file, or a
 * fetch/parse failure).
 *
 * Year-boundary fallback (backlog #6): BNR does not publish reference rates on
 * Jan 1-2 (both Romanian public holidays), so a transaction in that gap has no
 * same-year rate. ANAF requires the last rate published before the transaction
 * date, which is the prior year's final publication (e.g. 2024-12-31 for a
 * 2025-01-02 trade). Without this, the gap date resolved to null and the engine
 * silently fell back to a 1:1 exchange rate (treating USD as RON).
 */
async function getPriorYearLastRate(year: number, currency: string): Promise<BnrRate | null> {
  try {
    const { rates } = await fetchBnrRatesForYear(year - 1, currency);
    if (rates.length === 0) return null;
    return rates.reduce((latest, r) => (r.date > latest.date ? r : latest));
  } catch {
    return null;
  }
}

export async function getRateForDate(year: number, date: string, currency: string = 'USD'): Promise<number> {
  const { rates } = await fetchBnrRatesForYear(year, currency);

  // Exact match first
  const exact = rates.find(r => r.date === date);
  if (exact) return exact.rate;

  // Find the last published rate on or before the target date
  // Romanian tax law requires the BNR rate in effect on the transaction date,
  // which is the last rate published before that date (BNR doesn't publish on weekends/holidays)
  const target = new Date(date).getTime();
  let best: BnrRate | null = null;

  for (const r of rates) {
    const d = new Date(r.date).getTime();
    if (d <= target) {
      if (!best || d > new Date(best.date).getTime()) {
        best = r;
      }
    }
  }

  if (best) return best.rate;

  // Year boundary (backlog #6): the target precedes every same-year publication
  // (Jan 1-2, both RO holidays). Use the prior year's final rate, which is the
  // last rate published before the transaction date.
  const priorLast = await getPriorYearLastRate(year, currency);
  if (priorLast && new Date(priorLast.date).getTime() <= target) return priorLast.rate;

  throw new Error(`No rate found for ${currency} on or before ${date}`);
}

export async function getAllRatesForYear(year: number, currency: string = 'USD'): Promise<Record<string, number>> {
  const { rates } = await fetchBnrRatesForYear(year, currency);
  const map: Record<string, number> = {};
  for (const r of rates) {
    map[r.date] = r.rate;
  }

  // Year boundary (backlog #6): seed the prior year's final rate so an
  // on-or-before lookup over this map (makeRateLookup, used by both the CSV and
  // PDF per-date flows) resolves a Jan 1-2 date to the last rate published
  // before it, instead of returning null and falling back to a 1:1 rate.
  const priorLast = await getPriorYearLastRate(year, currency);
  if (priorLast && !(priorLast.date in map)) {
    map[priorLast.date] = priorLast.rate;
  }

  return map;
}

export function clearCache(): void {
  cache.clear();
}
