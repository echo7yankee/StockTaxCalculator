import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRatesXml, getAverageRate, getRateForDate, clearCache } from '../bnrRates.js';

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
    // (4.573 + 4.589 + 4.601) / 3 = 4.5877
    expect(avg).toBeCloseTo(4.5877, 3);
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
