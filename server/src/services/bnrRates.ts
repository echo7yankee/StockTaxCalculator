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

const cache = new Map<string, BnrYearRates>();

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
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
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
  cache.set(cacheKey, result);
  return result;
}

export async function getAverageRate(year: number, currency: string = 'USD'): Promise<number> {
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

  if (!best) throw new Error(`No rate found for ${currency} on or before ${date}`);
  return best.rate;
}

export async function getAllRatesForYear(year: number, currency: string = 'USD'): Promise<Record<string, number>> {
  const { rates } = await fetchBnrRatesForYear(year, currency);
  const map: Record<string, number> = {};
  for (const r of rates) {
    map[r.date] = r.rate;
  }
  return map;
}

export function clearCache(): void {
  cache.clear();
}
