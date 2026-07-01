import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Server } from 'http';
import prisma from '../../lib/prisma.js';
import { uploadsRouter } from '../uploads.js';
import { taxYearsRouter } from '../taxYears.js';

const TEST_USER_ID = 'test-user-auth-00000';
const TEST_USER_EMAIL = 'test-auth@test.com';

let server: Server;
// Listen on an OS-assigned free port so this file can never collide with another
// server test file's hardcoded port. BASE is filled in once the server is listening.
let BASE = '';

beforeAll(async () => {
  // Create test user
  await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { id: TEST_USER_ID, email: TEST_USER_EMAIL, name: 'Test User', plan: 'free' },
  });

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Mock auth middleware, simulate authenticated user
  app.use((req, _res, next) => {
    (req as any).user = { id: TEST_USER_ID, email: TEST_USER_EMAIL, name: 'Test User', plan: 'free' };
    (req as any).isAuthenticated = () => true;
    next();
  });

  app.use('/api/uploads', uploadsRouter);
  app.use('/api/tax-years', taxYearsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || address.port === 0) {
    throw new Error('Expected a TCP address with non-zero port from app.listen(0)');
  }
  BASE = `http://localhost:${address.port}`;
});

afterAll(async () => {
  // Clean up test data
  const taxYears = await prisma.taxYear.findMany({ where: { userId: TEST_USER_ID } });
  for (const ty of taxYears) {
    if (ty.id) {
      await prisma.securityCalculation.deleteMany({ where: { taxCalculation: { taxYearId: ty.id } } });
      await prisma.taxCalculation.deleteMany({ where: { taxYearId: ty.id } });
      await prisma.transaction.deleteMany({ where: { taxYearId: ty.id } });
      await prisma.csvUpload.deleteMany({ where: { taxYearId: ty.id } });
    }
  }
  await prisma.taxYear.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
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

describe('GET /api/uploads/opening-positions (year-round carry-forward, board #3)', () => {
  const OTHER_USER_ID = 'test-user-other-00000';
  const OTHER_USER_EMAIL = 'test-other@test.com';

  // Seed a prior-year calculation for the test user with a mix of securities:
  // one still held (should carry), one fully sold (remainingShares 0, must drop),
  // one with a null cost (must drop), one with no identifier (must drop).
  async function seedYear(userId: string, year: number, securities: Array<Record<string, unknown>>) {
    const ty = await prisma.taxYear.create({
      data: { userId, year, country: 'RO', status: 'calculated' },
    });
    const calc = await prisma.taxCalculation.create({
      data: { taxYearId: ty.id, totalTaxOwed: 100 },
    });
    for (const sec of securities) {
      await prisma.securityCalculation.create({
        data: { taxCalculationId: calc.id, ...sec },
      });
    }
    return ty;
  }

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { email: OTHER_USER_EMAIL },
      update: {},
      create: { id: OTHER_USER_ID, email: OTHER_USER_EMAIL, name: 'Other User', plan: 'free' },
    });

    // Prior year 2050 for the authed test user: AAPL held (carries), MSFT sold out,
    // TSLA null cost, an ID-less row. Only AAPL should surface.
    await seedYear(TEST_USER_ID, 2050, [
      { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', remainingShares: 10, weightedAvgCost: 350 },
      { isin: 'US5949181045', ticker: 'MSFT', securityName: 'Microsoft', remainingShares: 0, weightedAvgCost: 200 },
      { isin: 'US88160R1014', ticker: 'TSLA', securityName: 'Tesla', remainingShares: 5, weightedAvgCost: null },
      { isin: null, ticker: null, securityName: 'Mystery', remainingShares: 3, weightedAvgCost: 50 },
    ]);
    // An even-earlier year 2049, held but should NOT win over 2050 (closest prior).
    await seedYear(TEST_USER_ID, 2049, [
      { isin: 'US02079K3059', ticker: 'GOOGL', securityName: 'Alphabet', remainingShares: 8, weightedAvgCost: 130 },
    ]);
    // The OTHER user holds NFLX in 2050; must never leak to the test user.
    await seedYear(OTHER_USER_ID, 2050, [
      { isin: 'US64110L1061', ticker: 'NFLX', securityName: 'Netflix', remainingShares: 2, weightedAvgCost: 500 },
    ]);
  });

  afterAll(async () => {
    for (const uid of [TEST_USER_ID, OTHER_USER_ID]) {
      const tys = await prisma.taxYear.findMany({ where: { userId: uid } });
      for (const ty of tys) {
        await prisma.securityCalculation.deleteMany({ where: { taxCalculation: { taxYearId: ty.id } } });
        await prisma.taxCalculation.deleteMany({ where: { taxYearId: ty.id } });
      }
      await prisma.taxYear.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({ where: { id: OTHER_USER_ID } });
  });

  it('maps only the eligible securities from the closest prior year', async () => {
    const res = await fetch(`${BASE}/api/uploads/opening-positions?year=2051`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.year).toBe(2050);
    // AAPL only: MSFT (0 shares), TSLA (null cost), and the ID-less row are dropped.
    expect(data.positions).toHaveLength(1);
    expect(data.positions[0]).toEqual({
      isin: 'US0378331005',
      ticker: 'AAPL',
      securityName: 'Apple Inc.',
      shares: 10,
      costPerShareLocal: 350,
    });
  });

  it('picks the closest prior year when several exist (2050 over 2049)', async () => {
    const res = await fetch(`${BASE}/api/uploads/opening-positions?year=2051`);
    const data = await res.json();
    // 2050 is closer than 2049, so GOOGL from 2049 must not appear.
    expect(data.year).toBe(2050);
    expect(data.positions.some((p: { ticker: string }) => p.ticker === 'GOOGL')).toBe(false);
  });

  it('falls to 2049 when the requested year is 2050 (only strictly-prior years count)', async () => {
    const res = await fetch(`${BASE}/api/uploads/opening-positions?year=2050`);
    const data = await res.json();
    expect(data.year).toBe(2049);
    expect(data.positions).toHaveLength(1);
    expect(data.positions[0].ticker).toBe('GOOGL');
  });

  it('returns { year: null, positions: [] } when there is no prior year', async () => {
    const res = await fetch(`${BASE}/api/uploads/opening-positions?year=2049`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.year).toBeNull();
    expect(data.positions).toEqual([]);
  });

  it('does not leak another user\'s holdings (user isolation)', async () => {
    const res = await fetch(`${BASE}/api/uploads/opening-positions?year=2051`);
    const data = await res.json();
    expect(data.positions.some((p: { ticker: string }) => p.ticker === 'NFLX')).toBe(false);
  });

  it('returns 400 for a missing year param', async () => {
    const res = await fetch(`${BASE}/api/uploads/opening-positions`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an out-of-range year', async () => {
    const res = await fetch(`${BASE}/api/uploads/opening-positions?year=1800`);
    expect(res.status).toBe(400);
  });
});
