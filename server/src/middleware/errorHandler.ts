import type { ErrorRequestHandler } from 'express';
import { recordError } from '../lib/errorMonitor.js';

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

// Final error handler. Without it, Express's default handler echoes the error
// stack into the response body whenever NODE_ENV is not 'production'. Register
// after all routes. 5xx faults are recorded into the first-party ErrorEvent table.
export const jsonErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const e = err as HttpError;

  // body-parser (express.json) failure types.
  if (e.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON in request body' });
    return;
  }
  if (e.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' });
    return;
  }

  const status = e.status ?? e.statusCode ?? 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: 'Request error' });
    return;
  }

  // 5xx only: a genuine server-side fault, worth recording. The 4xx cases above
  // are client errors (bad input), not bugs, so they are not captured. req.path
  // excludes the query string, so the stored context carries no params. This is
  // fire-and-forget: the response must not wait on the error-monitor write (which
  // never throws on its own).
  console.error('[Server] Unhandled error:', err);
  void recordError({
    name: e.name,
    message: e.message,
    stack: e.stack,
    source: 'server',
    context: `${req.method} ${req.path}`,
  });
  res.status(500).json({ error: 'Internal server error' });
};
