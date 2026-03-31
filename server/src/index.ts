import express from 'express';
import cors from 'cors';
import { calculatorRouter } from './routes/calculator.js';
import { exchangeRatesRouter } from './routes/exchangeRates.js';
import { uploadsRouter } from './routes/uploads.js';
import { taxYearsRouter } from './routes/taxYears.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/calculator', calculatorRouter);
app.use('/api/exchange-rates', exchangeRatesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/tax-years', taxYearsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
