import { Router, Request, Response } from 'express';
import { runChecks } from '../services/dataAccess';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const results = await runChecks();
    res.json({ results });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

export default router;
