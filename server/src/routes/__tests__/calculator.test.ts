import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { calculatorRouter } from '../calculator.js';

let server: Server;
let BASE = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/calculator', calculatorRouter);
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

function post(body: unknown) {
  return fetch(`${BASE}/api/calculator/quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/calculator/quick (public LLM-facing compute API)', () => {
  it('computes the deterministic RO quick estimate from manual figures', async () => {
    const res = await post({ capitalGains: 10000 });
    expect(res.status).toBe(200);
    const data = await res.json();
    // RO capital-gains rate is 10% for the supported year.
    expect(data.capitalGainsTax).toBe(1000);
    expect(typeof data.totalOwed).toBe('number');
    expect(typeof data.totalAfterDiscount).toBe('number');
  });

  it('nets the foreign-withholding credit against the dividend tax', async () => {
    const res = await post({ dividends: 1000, withholdingTaxPaid: 30 });
    const data = await res.json();
    // 10% of 1000 = 100, minus 30 already withheld at source = 70 owed in RO.
    expect(data.dividendTax).toBe(70);
  });

  it('returns the LLM-relay contract fields documented in openapi.json', async () => {
    const res = await post({ capitalGains: 5000 });
    const data = await res.json();
    expect(data.currency).toBe('RON');
    expect(typeof data.taxYear).toBe('number');
    expect(typeof data.capitalGainsTaxRate).toBe('number');
    expect(typeof data.dividendTaxRate).toBe('number');
    expect(typeof data.disclaimer).toBe('string');
    expect(data.disclaimer.length).toBeGreaterThan(0);
    expect(data.source).toBe('https://investax.app');
  });

  it('does not expose any paid engine output (free quick-calc only)', async () => {
    const res = await post({ capitalGains: 5000, dividends: 1000 });
    const data = await res.json();
    // Moat boundary: the response carries only the free quick-calc fields, never
    // per-trade audit rows, D212 XML, or parsed securities.
    expect(data.transactions).toBeUndefined();
    expect(data.auditRows).toBeUndefined();
    expect(data.d212).toBeUndefined();
    expect(data.xml).toBeUndefined();
  });

  it('rejects a negative input with 400', async () => {
    const res = await post({ capitalGains: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported country with 400', async () => {
    const res = await post({ capitalGains: 1000, country: 'US' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/country/i);
  });
});
