import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { Server } from 'http';

// Mock the BNR rate service before importing the router so the route picks up the
// mocked bindings (same approach as parseReports.test.ts). The real fetch logic is
// unit-tested in services/__tests__/bnrRates.test.ts; here we isolate the route's
// input validation + status-code contract.
const getAverageRateMock = vi.fn();
const getRateForDateMock = vi.fn();
const getAllRatesForYearMock = vi.fn();
vi.mock('../../services/bnrRates.js', () => ({
  getAverageRate: getAverageRateMock,
  getRateForDate: getRateForDateMock,
  getAllRatesForYear: getAllRatesForYearMock,
}));

const { exchangeRatesRouter } = await import('../exchangeRates.js');

let server: Server;
// Listen on an OS-assigned free port so this file can never collide with another
// server test file's hardcoded port. BASE is filled in once the server is listening.
let BASE = '';

beforeAll(async () => {
  const app = express();
  app.use('/api/exchange-rates', exchangeRatesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || address.port === 0) {
    throw new Error('Expected a TCP address with non-zero port from app.listen(0)');
  }
  BASE = `http://localhost:${address.port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  getAverageRateMock.mockReset();
  getRateForDateMock.mockReset();
  getAllRatesForYearMock.mockReset();
  getAverageRateMock.mockResolvedValue(4.4705);
  getRateForDateMock.mockResolvedValue(4.7728);
  getAllRatesForYearMock.mockResolvedValue({ '2025-01-02': 4.61, '2025-01-03': 4.62 });
});

function get(path: string) {
  return fetch(`${BASE}/api/exchange-rates${path}`);
}

// Each endpoint exposes the same currency-validation contract; table-drive it so a
// regression in any one route is caught. The third entry is the catch-all
// `/:year/:date` route, reached with a concrete date segment.
const ENDPOINTS = [
  { name: 'average', path: (q: string) => `/2025/average${q}`, mock: () => getAverageRateMock },
  { name: 'daily', path: (q: string) => `/2025/daily${q}`, mock: () => getAllRatesForYearMock },
  { name: 'date', path: (q: string) => `/2025/2025-03-15${q}`, mock: () => getRateForDateMock },
] as const;

describe('GET /api/exchange-rates: happy path', () => {
  it('returns 200 with the average rate', async () => {
    const res = await get('/2025/average?currency=USD');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ rate: 4.4705, currency: 'USD', year: 2025, type: 'average' });
    expect(getAverageRateMock).toHaveBeenCalledWith(2025, 'USD');
  });

  it('returns 200 with all daily rates for a year', async () => {
    const res = await get('/2025/daily?currency=EUR');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('daily');
    expect(body.count).toBe(2);
    expect(getAllRatesForYearMock).toHaveBeenCalledWith(2025, 'EUR');
  });

  it('returns 200 with a per-date rate', async () => {
    const res = await get('/2025/2025-03-15?currency=GBP');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ rate: 4.7728, currency: 'GBP', date: '2025-03-15', type: 'daily' });
    expect(getRateForDateMock).toHaveBeenCalledWith(2025, '2025-03-15', 'GBP');
  });

  it('defaults to USD when currency is omitted', async () => {
    const res = await get('/2025/average');
    expect(res.status).toBe(200);
    expect(getAverageRateMock).toHaveBeenCalledWith(2025, 'USD');
  });

  it('normalizes a lowercase currency to uppercase', async () => {
    const res = await get('/2025/average?currency=eur');
    expect(res.status).toBe(200);
    expect(getAverageRateMock).toHaveBeenCalledWith(2025, 'EUR');
  });
});

describe('GET /api/exchange-rates: invalid currency returns 400, not 502', () => {
  // The bug fixed here: currencySchema.parse() threw inside the try block, so a
  // malformed currency surfaced as a 502 (upstream-failure class) carrying a
  // verbose Zod-issue blob. It must be a clean 400 like the year branch.
  for (const ep of ENDPOINTS) {
    it(`${ep.name}: too-short currency yields 400 and never calls the service`, async () => {
      const res = await get(ep.path('?currency=US'));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid currency' });
      expect(ep.mock()).not.toHaveBeenCalled();
    });

    it(`${ep.name}: too-long currency yields 400`, async () => {
      const res = await get(ep.path('?currency=USDD'));
      expect(res.status).toBe(400);
      expect(ep.mock()).not.toHaveBeenCalled();
    });

    it(`${ep.name}: non-alphabetic currency yields 400`, async () => {
      const res = await get(ep.path('?currency=12X'));
      expect(res.status).toBe(400);
      expect(ep.mock()).not.toHaveBeenCalled();
    });
  }
});

describe('GET /api/exchange-rates: year validation unchanged', () => {
  it('returns 400 for a non-numeric year', async () => {
    const res = await get('/notayear/average?currency=USD');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid year' });
  });

  it('returns 400 for an out-of-range year', async () => {
    const res = await get('/1800/average?currency=USD');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/exchange-rates: genuine upstream failure still 502', () => {
  it('returns 502 when the BNR service throws', async () => {
    getAverageRateMock.mockRejectedValueOnce(new Error('BNR endpoint unreachable'));
    const res = await get('/2025/average?currency=USD');
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('BNR endpoint unreachable');
  });
});
