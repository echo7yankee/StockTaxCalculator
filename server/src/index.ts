import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { sessionMiddleware, requirePaidPlan } from './middleware/auth.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { jsonErrorHandler } from './middleware/errorHandler.js';
import { recordError, toCapturedError, recordCaughtError } from './lib/errorMonitor.js';
import passport from './config/passport.js';
import { authRouter } from './routes/auth.js';
import { calculatorRouter } from './routes/calculator.js';
import { exchangeRatesRouter } from './routes/exchangeRates.js';
import { uploadsRouter } from './routes/uploads.js';
import { taxYearsRouter } from './routes/taxYears.js';
import { paymentRouter } from './routes/payment.js';
import { stripeWebhookRouter } from './routes/webhook.stripe.js';
import { contactRouter } from './routes/contact.js';
import { subscribeRouter } from './routes/subscribe.js';
import { parseReportsRouter } from './routes/parseReports.js';
import { trackRouter } from './routes/track.js';
import { errorsRouter } from './routes/errors.js';
import { analyticsRouter } from './routes/analytics.js';

// First-party crash capture. Record process-level errors into the ErrorEvent
// table (recordError never throws on its own); toCapturedError / recordCaughtError
// live in lib/errorMonitor so route catch blocks share the same shape.
//
// uncaughtException leaves the process in an undefined state, so we preserve the
// default exit-and-restart (log + exit 1, which pm2 restarts). The error-monitor
// write is given a chance to land first, bounded by a short timer so a hung
// write can never keep a dead process alive.
process.on('uncaughtException', (err) => {
  let exited = false;
  const exit = () => {
    if (exited) return;
    exited = true;
    console.error('[uncaughtException]', err);
    process.exit(1);
  };
  const guard = setTimeout(exit, 2000);
  guard.unref();
  void recordError(toCapturedError(err, 'uncaughtException')).finally(() => {
    clearTimeout(guard);
    exit();
  });
});

// unhandledRejection is recorded but NOT treated as fatal: registering this
// listener already suppresses Node's default crash, and taking the whole server
// down for one stray rejection is worse than logging it and carrying on.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  recordCaughtError(reason, 'unhandledRejection');
});

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
  // First-party analytics fires a beacon per route change, far chattier than the
  // rest of the API. It has its own (more generous) limiter in routes/track.ts,
  // so exclude it here to keep pageviews from eating a real user's protective budget.
  // Client error beacons (routes/errors.ts) are excluded for the same reason: an
  // error-storm must not exhaust a real user's protective API budget; that endpoint
  // has its own dedicated limiter.
  // The public quick-calc compute endpoint (routes/calculator.ts) is documented for
  // LLMs / ChatGPT Actions, whose calls cluster on a few shared provider egress IPs;
  // it has its own dedicated limiter, so exclude it here too (otherwise one provider
  // IP would exhaust the per-IP budget for every user of an InvesTax GPT).
  skip: (req) =>
    req.path.startsWith('/api/track') ||
    req.path.startsWith('/api/errors') ||
    req.path.startsWith('/api/calculator'),
}));
// Webhook route needs raw body for signature verification — must be before express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);

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

// Payment routes (public — checkout and promo counter)
app.use('/api/payment', paymentRouter);

// Contact form (public — anyone can submit a message)
app.use('/api/contact', contactRouter);

// Email capture (public): filing reminder + broker-graduation waitlist, double opt-in
app.use('/api/subscribe', subscribeRouter);

// First-party, cookieless analytics ingest (public): pageviews + funnel events
app.use('/api/track', trackRouter);

// First-party client error ingest (public): client-side captured errors land in
// the same grouped ErrorEvent table as server errors (source='client').
app.use('/api/errors', errorsRouter);

// Protected routes (require auth + paid plan)
app.use('/api/uploads', requirePaidPlan, uploadsRouter);
app.use('/api/tax-years', requirePaidPlan, taxYearsRouter);
app.use('/api/parse-reports', requirePaidPlan, parseReportsRouter);

// Operator-only analytics dashboard API (auth + ADMIN_EMAILS allowlist)
app.use('/api/analytics', requireAdmin, analyticsRouter);

// JSON error handler, must be last, after all routes. It records 5xx faults into
// the first-party ErrorEvent table (see middleware/errorHandler.ts).
app.use(jsonErrorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
