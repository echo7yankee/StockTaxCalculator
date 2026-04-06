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

const cache = new Map<number, BnrYearRates>();

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
  if (cache.has(year)) {
    return cache.get(year)!;
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
  cache.set(year, result);
  return result;
}

export async function getAverageRate(year: number, currency: string = 'USD'): Promise<number> {
  const { rates } = await fetchBnrRatesForYear(year, currency);
  const sum = rates.reduce((s, r) => s + r.rate, 0);
  return Math.round((sum / rates.length) * 10000) / 10000;
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

export function clearCache(): void {
  cache.clear();
}
