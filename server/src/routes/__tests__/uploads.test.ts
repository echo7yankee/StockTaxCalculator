import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { uploadsRouter } from '../uploads.js';
import { taxYearsRouter } from '../taxYears.js';

let server: Server;
const PORT = 3099;
const BASE = `http://localhost:${PORT}`;

beforeAll(() => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/tax-years', taxYearsRouter);
  server = app.listen(PORT);
});

afterAll(() => {
  server?.close();
});

const samplePayload = {
  year: 2099, // Use a future year to avoid conflicts
  country: 'RO',
  broker: 'trading212',
  fileName: 'test-statement.pdf',
  taxResult: {
    capitalGains: { totalProceeds: 50000, totalCostBasis: 40000, netGains: 10000, losses: 0, taxRate: 0.1, taxOwed: 1000 },
    dividends: { grossTotal: 500, withholdingTaxPaid: 75, taxOwed: 0 },
    healthContribution: { totalNonSalaryIncome: 10500, thresholdHit: 'none', amountOwed: 0 },
    totals: { totalTaxOwed: 1000, earlyFilingDiscount: 30, totalAfterDiscount: 970 },
  },
  securities: [
    {
      isin: 'US0378331005',
      ticker: 'AAPL',
      securityName: 'Apple Inc.',
      totalBoughtShares: 20,
      totalSoldShares: 10,
      remainingShares: 10,
      weightedAvgCostLocal: 4000,
      totalProceeds: 50000,
      totalCostBasis: 40000,
      realizedGainLoss: 10000,
      totalDividends: 500,
      totalWithholdingTax: 75,
    },
  ],
};

describe('uploads + taxYears API', () => {
  let savedId: string;

  it('POST /api/uploads saves a calculation', async () => {
    const res = await fetch(`${BASE}/api/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePayload),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.year).toBe(2099);
    expect(data.status).toBe('calculated');
    expect(data.id).toBeTruthy();
    savedId = data.id;
  });

  it('GET /api/tax-years returns saved calculations', async () => {
    const res = await fetch(`${BASE}/api/tax-years`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const ty = data.find((t: { year: number }) => t.year === 2099);
    expect(ty).toBeTruthy();
    expect(ty.totalTaxOwed).toBe(1000);
    expect(ty.fileName).toBe('test-statement.pdf');
  });

  it('GET /api/tax-years/:id returns detail with securities', async () => {
    const res = await fetch(`${BASE}/api/tax-years/${savedId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.year).toBe(2099);
    expect(data.calculation).toBeTruthy();
    expect(data.calculation.securities.length).toBe(1);
    expect(data.calculation.securities[0].ticker).toBe('AAPL');
  });

  it('POST /api/uploads replaces existing calculation for same year', async () => {
    const modified = {
      ...samplePayload,
      taxResult: {
        ...samplePayload.taxResult,
        totals: { ...samplePayload.taxResult.totals, totalTaxOwed: 2000 },
      },
    };
    const res = await fetch(`${BASE}/api/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modified),
    });
    expect(res.status).toBe(201);

    const listRes = await fetch(`${BASE}/api/tax-years`);
    const list = await listRes.json();
    const year2099 = list.filter((t: { year: number }) => t.year === 2099);
    expect(year2099).toHaveLength(1);
    expect(year2099[0].totalTaxOwed).toBe(2000);
  });

  it('DELETE /api/tax-years/:id removes the record', async () => {
    const listRes = await fetch(`${BASE}/api/tax-years`);
    const list = await listRes.json();
    const item = list.find((t: { year: number }) => t.year === 2099);

    const res = await fetch(`${BASE}/api/tax-years/${item.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    const afterRes = await fetch(`${BASE}/api/tax-years`);
    const after = await afterRes.json();
    expect(after.find((t: { id: string }) => t.id === item.id)).toBeUndefined();
  });

  it('returns 400 for missing year', async () => {
    const res = await fetch(`${BASE}/api/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxResult: samplePayload.taxResult }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown tax year id', async () => {
    const res = await fetch(`${BASE}/api/tax-years/nonexistent-id`);
    expect(res.status).toBe(404);
  });
});
