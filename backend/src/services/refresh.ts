import { db } from '../db';
import { refreshLog, shortageRecords } from '../db/schema';
import { runChecks } from './dataAccess';
import { runIngestion } from './ingestion';

let refreshInProgress = false;
let lastRefreshResult: Awaited<ReturnType<typeof runIngestion>> | null = null;

export function isRefreshRunning(): boolean {
  return refreshInProgress;
}

export function getLastRefreshResult(): Awaited<ReturnType<typeof runIngestion>> | null {
  return lastRefreshResult;
}

/**
 * Full refresh: fetch fresh artifacts from all 13 sources, then ingest.
 * Intended for the daily cron job or manual /api/refresh trigger.
 * Takes 60-120s depending on network.
 */
export async function performRefresh(): Promise<Awaited<ReturnType<typeof runIngestion>>> {
  if (refreshInProgress) throw new Error('Refresh already in progress');
  refreshInProgress = true;

  try {
    console.log('[Refresh] Fetching sources...');
    const fetchResults = await runChecks();
    const fetchOk = fetchResults.filter((r) => r.ok).length;
    console.log(`[Refresh] Fetched: ${fetchOk}/${fetchResults.length} sources ok`);

    console.log('[Refresh] Ingesting...');
    const result = await runIngestion();
    lastRefreshResult = result;
    console.log(`[Refresh] Done: ${result.sourcesOk} ok, ${result.sourcesFailed} failed`);
    return result;
  } catch (err) {
    const error = err as Error;
    console.error('[Refresh] Failed:', error.message);
    db.insert(refreshLog)
      .values({ startedAt: new Date(), completedAt: new Date(), status: 'failed', sourcesOk: 0, sourcesFailed: 1, notes: error.message })
      .run();
    throw error;
  } finally {
    refreshInProgress = false;
  }
}

/**
 * Ingest-only: parse existing artifacts → SQLite. No network calls.
 * Takes ~5-10s. Called at server startup when DB is empty.
 */
export async function performIngestOnly(): Promise<Awaited<ReturnType<typeof runIngestion>>> {
  if (refreshInProgress) throw new Error('Refresh already in progress');
  refreshInProgress = true;

  try {
    console.log('[Startup] Ingesting from existing artifacts...');
    const result = await runIngestion();
    lastRefreshResult = result;
    console.log(`[Startup] Done: ${result.sourcesOk} ok, ${result.sourcesFailed} failed`);
    return result;
  } finally {
    refreshInProgress = false;
  }
}

/**
 * Called on server startup. If the DB is empty (no shortages), seed it from
 * existing artifacts — fast, no network. If the DB already has data, skip.
 */
export async function seedIfEmpty(): Promise<void> {
  const row = db.select({ count: shortageRecords.id }).from(shortageRecords).limit(1).all();
  if (row.length > 0) {
    console.log('[Startup] DB already populated — skipping seed');
    return;
  }
  console.log('[Startup] DB is empty — seeding from existing artifacts...');
  try {
    await performIngestOnly();
  } catch (err) {
    console.warn('[Startup] Seed failed (artifacts may not exist yet — run npm run refresh):', (err as Error).message);
  }
}
