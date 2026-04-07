import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { sessionMiddleware, requireAuth } from './middleware/auth.js';
import passport from './config/passport.js';
import { authRouter } from './routes/auth.js';
import { calculatorRouter } from './routes/calculator.js';
import { exchangeRatesRouter } from './routes/exchangeRates.js';
import { uploadsRouter } from './routes/uploads.js';
import { taxYearsRouter } from './routes/taxYears.js';

// Initialize Sentry (only active when SENTRY_DSN is set + production)
if (process.env.SENTRY_DSN && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.2,
  });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Trust nginx reverse proxy (required for secure cookies behind HTTPS proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(express.json({ limit: '10mb' }));

// Session + Passport
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.use('/api/auth', authRouter);

// Public routes
app.use('/api/calculator', calculatorRouter);
app.use('/api/exchange-rates', exchangeRatesRouter);

// Protected routes
app.use('/api/uploads', requireAuth, uploadsRouter);
app.use('/api/tax-years', requireAuth, taxYearsRouter);

// Sentry error handler (must be after all routes)
if (process.env.SENTRY_DSN && process.env.NODE_ENV === 'production') {
  Sentry.setupExpressErrorHandler(app);
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
