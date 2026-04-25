// IMPORTANT: `dotenv/config` must load before any other internal import
// so modules that read `process.env` at load-time see the .env values.
import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import dataSourcesRouter from './routes/dataSources';
import graphRouter from './routes/graph';
import investigateRouter from './routes/investigate';
import refreshRouter from './routes/refresh';
import shortagesRouter from './routes/shortages';
import { seedIfEmpty } from './services/refresh';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

// API responses represent mutable live data — no caching proxies should hold them.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/data-sources', dataSourcesRouter);
app.use('/api/refresh', refreshRouter);
app.use('/api/shortages', shortagesRouter);
app.use('/api/graph', graphRouter);
app.use('/api/investigate', investigateRouter);

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  // If DB is empty (first boot or after data wipe), seed from existing artifacts.
  // Data stays current via the daily cron: `npm run refresh`
  seedIfEmpty().catch((err) => console.error('[Startup] Seed error:', err.message));
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} is already in use`);
  } else {
    console.error('[Server] Listen error:', err);
  }
  process.exit(1);
});

// Graceful shutdown — finish in-flight requests, then close the DB handle.
function shutdown(signal: string): void {
  console.log(`\n[Server] ${signal} received — shutting down gracefully`);
  server.close((err) => {
    if (err) {
      console.error('[Server] Error during close:', err);
      process.exit(1);
    }
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
  // Force-exit if shutdown takes too long
  setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Survive errors from agent/LLM so the server doesn't die mid-demo
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.message : reason);
});

export default app;
