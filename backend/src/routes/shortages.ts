import { Router, Request, Response } from 'express';
import { db } from '../db';
import { shortageRecords } from '../db/schema';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const records = db.select().from(shortageRecords).all();
    res.json({ count: records.length, records });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

export default router;
