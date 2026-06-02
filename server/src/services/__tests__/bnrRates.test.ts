import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRatesXml, getAverageRate, getRateForDate, getAllRatesForYear, clearCache } from '../bnrRates.js';

const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<DataSet>
  <Body>
    <Cube date="2025-01-02">
      <Rate currency="USD">4.5730</Rate>
      <Rate currency="EUR">4.9760</Rate>
      <Rate currency="GBP">5.7280</Rate>
    </Cube>
    <Cube date="2025-01-03">
      <Rate currency="USD">4.5890</Rate>
      <Rate currency="EUR">4.9800</Rate>
    </Cube>
    <Cube date="2025-01-06">
      <Rate currency="USD">4.6010</Rate>
      <Rate currency="EUR">4.9850</Rate>
    </Cube>
  </Body>
</DataSet>`;

const XML_WITH_MULTIPLIER = `<?xml version="1.0" encoding="utf-8"?>
<DataSet>
  <Body>
    <Cube date="2025-01-02">
      <Rate currency="HUF" multiplier="100">1.2345</Rate>
      <Rate currency="USD">4.5730</Rate>
    </Cube>
  </Body>
</DataSet>`;

// Two months with different day counts: January has 3 rates (mean 4.00),
// February has 1 rate (mean 5.00). BNR's official annual average is the mean of
// the two MONTHLY averages = 4.50. A flat daily mean would be (4+4+4+5)/4 = 4.25.
// This fixture pins the monthly-of-monthly method (Codul Fiscal art. 131 alin. 6).
const MULTI_MONTH_XML = `<?xml version="1.0" encoding="utf-8"?>
<DataSet>
  <Body>
    <Cube date="2025-01-02"><Rate currency="USD">4.0000</Rate></Cube>
    <Cube date="2025-01-03"><Rate currency="USD">4.0000</Rate></Cube>
    <Cube date="2025-01-06"><Rate currency="USD">4.0000</Rate></Cube>
    <Cube date="2025-02-03"><Rate currency="USD">5.0000</Rate></Cube>
  </Body>
</DataSet>`;

// Year-boundary fixtures (backlog #6). Models reality: BNR's first 2025
// publication is 2025-01-03 (Jan 1-2 are Romanian public holidays, no rate),
// and the prior year's final publication is 2024-12-31. A trade on 2025-01-02
// (NYSE was open that Thursday) must convert at the 2024-12-31 rate per ANAF.
const XML_2025_JAN = `<?xml version="1.0" encoding="utf-8"?>
<DataSet>
  <Body>
    <Cube date="2025-01-03"><Rate currency="USD">4.5890</Rate><Rate currency="EUR">4.9800</Rate></Cube>
    <Cube date="2025-01-08"><Rate currency="USD">4.6010</Rate><Rate currency="EUR">4.9850</Rate></Cube>
  </Body>
</DataSet>`;

const XML_2024_DEC = `<?xml version="1.0" encoding="utf-8"?>
<DataSet>
  <Body>
    <Cube date="2024-12-30"><Rate currency="USD">4.4400</Rate><Rate currency="EUR">4.9700</Rate></Cube>
    <Cube date="2024-12-31"><Rate currency="USD">4.4500</Rate><Rate currency="EUR">4.9740</Rate></Cube>
  </Body>
</DataSet>`;

/**
 * Mocks `fetch` to return year-specific BNR XML by matching the year in the
 * `nbrfxrates{year}.xml` URL. Any year not in `byYear` returns a 404 (models
 * BNR having no file for that year).
 */
function mockFetchByYear(byYear: Record<number, string>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    for (const [year, xml] of Object.entries(byYear)) {
      if (url.includes(`nbrfxrates${year}.xml`)) {
        return Promise.resolve(new Response(xml, { status: 200 }));
      }
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  });
}

describe('parseRatesXml', () => {
  it('extracts USD rates from BNR XML', () => {
    const rates = parseRatesXml(SAMPLE_XML, 'USD');
    expect(rates).toHaveLength(3);
    expect(rates[0]).toEqual({ date: '2025-01-02', currency: 'USD', rate: 4.573 });
    expect(rates[1]).toEqual({ date: '2025-01-03', currency: 'USD', rate: 4.589 });
    expect(rates[2]).toEqual({ date: '2025-01-06', currency: 'USD', rate: 4.601 });
  });

  it('filters by requested currency', () => {
    const eurRates = parseRatesXml(SAMPLE_XML, 'EUR');
    expect(eurRates).toHaveLength(3);
    expect(eurRates[0].currency).toBe('EUR');

    const gbpRates = parseRatesXml(SAMPLE_XML, 'GBP');
    expect(gbpRates).toHaveLength(1);
  });

  it('handles multiplier attribute', () => {
    const rates = parseRatesXml(XML_WITH_MULTIPLIER, 'HUF');
    expect(rates).toHaveLength(1);
    // 1.2345 / 100 = 0.012345
    expect(rates[0].rate).toBeCloseTo(0.012345, 5);
  });

  it('returns empty array for missing currency', () => {
    const rates = parseRatesXml(SAMPLE_XML, 'JPY');
    expect(rates).toHaveLength(0);
  });

  it('returns empty array for invalid XML', () => {
    const rates = parseRatesXml('<invalid>data</invalid>', 'USD');
    expect(rates).toHaveLength(0);
  });
});

describe('getAverageRate', () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it('calculates yearly average from fetched rates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(SAMPLE_XML, { status: 200 })
    );

    const avg = await getAverageRate(2025, 'USD');
    // All three rates are in January, so the single monthly average IS the annual
    // average: (4.573 + 4.589 + 4.601) / 3 = 4.5877.
    expect(avg).toBeCloseTo(4.5877, 3);
  });

  it('averages the monthly averages, not the daily rates (art. 131 alin. 6)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(MULTI_MONTH_XML, { status: 200 })
    );

    const avg = await getAverageRate(2025, 'USD');
    // Monthly-of-monthly: (mean(Jan)=4.00 + mean(Feb)=5.00) / 2 = 4.5000.
    // A flat daily mean would (wrongly) give (4+4+4+5)/4 = 4.2500.
    expect(avg).toBe(4.5);
  });

  it('caches results for repeated calls', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(SAMPLE_XML, { status: 200 })
    );

    await getAverageRate(2025, 'USD');
    await getAverageRate(2025, 'USD');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 })
    );

    await expect(getAverageRate(2025, 'USD')).rejects.toThrow('BNR API returned 404');
  });

  it('throws when no rates found for currency', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(SAMPLE_XML, { status: 200 })
    );

    await expect(getAverageRate(2025, 'JPY')).rejects.toThrow('No JPY rates found');
  });
});

describe('getRateForDate', () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it('returns exact rate for matching date', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(SAMPLE_XML, { status: 200 })
    );

    const rate = await getRateForDate(2025, '2025-01-03', 'USD');
    expect(rate).toBe(4.589);
  });

  it('returns last rate before target when exact date not found (weekend → Friday)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(SAMPLE_XML, { status: 200 })
    );

    // Jan 4 (Sat) should use Jan 3 (Fri) rate, NOT Jan 6 (Mon)
    const rate = await getRateForDate(2025, '2025-01-04', 'USD');
    expect(rate).toBe(4.589); // Jan 3 rate
  });

  it('picks previous rate even when next date is closer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(SAMPLE_XML, { status: 200 })
    );

    // Jan 5 (Sun) is 2 days after Jan 3 but 1 day before Jan 6
    // Old bug: would pick Jan 6 (closer). Correct: pick Jan 3 (last before)
    const rate = await getRateForDate(2025, '2025-01-05', 'USD');
    expect(rate).toBe(4.589); // Jan 3 rate, NOT Jan 6 (4.601)
  });
});

describe('getAllRatesForYear', () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it('returns a date-to-rate map', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(SAMPLE_XML, { status: 200 })
    );

    const rates = await getAllRatesForYear(2025, 'USD');
    expect(rates['2025-01-02']).toBe(4.573);
    expect(rates['2025-01-03']).toBe(4.589);
    expect(rates['2025-01-06']).toBe(4.601);
    expect(Object.keys(rates)).toHaveLength(3);
  });

  it('caches per currency (USD and EUR do not collide)', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => Promise.resolve(new Response(SAMPLE_XML, { status: 200 }))
    );

    await getAllRatesForYear(2025, 'USD');
    await getAllRatesForYear(2025, 'EUR');
    // Each call fetches the requested year AND the prior year (the Jan 1-2
    // boundary seed, backlog #6): 2025-USD + 2024-USD + 2025-EUR + 2024-EUR = 4.
    // USD and EUR are cached under separate keys, so they never collide.
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

describe('year-boundary BNR fallback (backlog #6)', () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it('getRateForDate resolves a Jan 1-2 date to the prior year final rate', async () => {
    mockFetchByYear({ 2025: XML_2025_JAN, 2024: XML_2024_DEC });

    // BNR's first 2025 publication is 2025-01-03; Jan 1-2 are RO holidays with no
    // rate. A 2025-01-02 trade must use 2024-12-31 (last published before it).
    const rate = await getRateForDate(2025, '2025-01-02', 'USD');
    expect(rate).toBe(4.45); // 2024-12-31, NOT 4.589 (2025-01-03) and NOT a throw
  });

  it('getRateForDate resolves Jan 1 the same way (both holidays)', async () => {
    mockFetchByYear({ 2025: XML_2025_JAN, 2024: XML_2024_DEC });

    const rate = await getRateForDate(2025, '2025-01-01', 'EUR');
    expect(rate).toBe(4.974); // 2024-12-31 EUR rate
  });

  it('getAllRatesForYear seeds the prior year final rate as the boundary anchor', async () => {
    mockFetchByYear({ 2025: XML_2025_JAN, 2024: XML_2024_DEC });

    const rates = await getAllRatesForYear(2025, 'USD');
    // The prior year's LAST publication (2024-12-31) is seeded; the earlier
    // 2024-12-30 is not (only the boundary anchor is needed). An on-or-before
    // lookup (makeRateLookup) over this map resolves 2025-01-02 to 4.45.
    expect(rates['2024-12-31']).toBe(4.45);
    expect(rates['2024-12-30']).toBeUndefined();
    expect(rates['2025-01-03']).toBe(4.589);
  });

  it('getRateForDate still throws when no prior-year data exists', async () => {
    mockFetchByYear({ 2025: XML_2025_JAN }); // 2024 -> 404

    await expect(getRateForDate(2025, '2025-01-02', 'USD')).rejects.toThrow(
      'No rate found for USD on or before 2025-01-02',
    );
  });

  it('getAllRatesForYear omits the seed (prior behavior) when prior-year data is unavailable', async () => {
    mockFetchByYear({ 2025: XML_2025_JAN }); // 2024 -> 404

    const rates = await getAllRatesForYear(2025, 'USD');
    expect(rates['2025-01-03']).toBe(4.589);
    // Graceful degradation: no 2024 anchor, so the gap behaves as it did before.
    expect(Object.keys(rates).some((d) => d.startsWith('2024'))).toBe(false);
  });

  it('does not affect a normal in-year date (exact match wins, no boundary use)', async () => {
    mockFetchByYear({ 2025: XML_2025_JAN, 2024: XML_2024_DEC });

    const rate = await getRateForDate(2025, '2025-01-08', 'USD');
    expect(rate).toBe(4.601); // same-year rate, unaffected by the prior-year seed
  });
});
