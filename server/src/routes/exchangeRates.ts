import { Router } from 'express';
import { z } from 'zod/v4';
import { getAverageRate, getRateForDate, getAllRatesForYear } from '../services/bnrRates.js';

export const exchangeRatesRouter = Router();

const yearSchema = z.coerce.number().int().min(2000).max(2100);
const currencySchema = z.string().length(3).regex(/^[A-Z]{3}$/).default('USD');

// GET /api/exchange-rates/:year/average?currency=USD
exchangeRatesRouter.get('/:year/average', async (req, res) => {
  try {
    const yearParsed = yearSchema.safeParse(req.params.year);
    if (!yearParsed.success) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }
    const year = yearParsed.data;

    const currency = currencySchema.parse(((req.query.currency as string) || 'USD').toUpperCase());
    const rate = await getAverageRate(year, currency.toUpperCase());

    res.json({ rate, currency: currency.toUpperCase(), year, type: 'average' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch exchange rate';
    res.status(502).json({ error: message });
  }
});

// GET /api/exchange-rates/:year/daily?currency=USD — all daily rates for a year
exchangeRatesRouter.get('/:year/daily', async (req, res) => {
  try {
    const yearParsed = yearSchema.safeParse(req.params.year);
    if (!yearParsed.success) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }
    const year = yearParsed.data;
    const currency = currencySchema.parse(((req.query.currency as string) || 'USD').toUpperCase());
    const rates = await getAllRatesForYear(year, currency.toUpperCase());

    res.json({ rates, currency: currency.toUpperCase(), year, type: 'daily', count: Object.keys(rates).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch exchange rates';
    res.status(502).json({ error: message });
  }
});

// GET /api/exchange-rates/:year/:date?currency=USD
exchangeRatesRouter.get('/:year/:date', async (req, res) => {
  try {
    const yearParsed = yearSchema.safeParse(req.params.year);
    if (!yearParsed.success) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }
    const year = yearParsed.data;

    const { date } = req.params;
    const currency = currencySchema.parse(((req.query.currency as string) || 'USD').toUpperCase());
    const rate = await getRateForDate(year, date, currency.toUpperCase());

    res.json({ rate, currency: currency.toUpperCase(), year, date, type: 'daily' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch exchange rate';
    res.status(502).json({ error: message });
  }
});
