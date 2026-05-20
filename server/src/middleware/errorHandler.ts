import type { ErrorRequestHandler } from 'express';

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

// Final error handler. Without it, Express's default handler echoes the error
// stack into the response body whenever NODE_ENV is not 'production'. Register
// after all routes (and after the Sentry error handler).
export const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
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

  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
};
