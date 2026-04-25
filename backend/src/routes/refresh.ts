import { Router, Request, Response } from 'express';
import { isRefreshRunning, performRefresh, getLastRefreshResult } from '../services/refresh';

const router = Router();

router.post('/', async (_req: Request, res: Response) => {
  if (isRefreshRunning()) {
    res.status(409).json({ error: 'Refresh already in progress' });
    return;
  }

  try {
    const result = await performRefresh();
    res.json({
      status: result.status,
      sourcesOk: result.sourcesOk,
      sourcesFailed: result.sourcesFailed,
      durationMs: result.completedAt.getTime() - result.startedAt.getTime(),
      results: result.results,
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

router.get('/status', (_req: Request, res: Response) => {
  const last = getLastRefreshResult();
  res.json({
    running: isRefreshRunning(),
    lastRefresh: last
      ? {
          status: last.status,
          startedAt: last.startedAt,
          completedAt: last.completedAt,
          sourcesOk: last.sourcesOk,
          sourcesFailed: last.sourcesFailed,
        }
      : null,
  });
});

export default router;
