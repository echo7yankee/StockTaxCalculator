import { Router } from 'express';
import { getAverageRate, getRateForDate } from '../services/bnrRates.js';

export const exchangeRatesRouter = Router();

// GET /api/exchange-rates/:year/average?currency=USD
exchangeRatesRouter.get('/:year/average', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }

    const currency = (req.query.currency as string) || 'USD';
    const rate = await getAverageRate(year, currency.toUpperCase());

    res.json({ rate, currency: currency.toUpperCase(), year, type: 'average' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch exchange rate';
    res.status(502).json({ error: message });
  }
});

// GET /api/exchange-rates/:year/:date?currency=USD
exchangeRatesRouter.get('/:year/:date', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }

    const { date } = req.params;
    const currency = (req.query.currency as string) || 'USD';
    const rate = await getRateForDate(year, date, currency.toUpperCase());

    res.json({ rate, currency: currency.toUpperCase(), year, date, type: 'daily' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch exchange rate';
    res.status(502).json({ error: message });
  }
});
