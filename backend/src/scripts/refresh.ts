/**
 * Standalone daily refresh script — intended for cron job use.
 * Fetches all 13 data sources, then ingests into SQLite.
 *
 * Crontab (runs at 2am daily):
 *   0 2 * * * cd /path/to/backend && npm run refresh >> /var/log/drug-shortage-refresh.log 2>&1
 *
 * Usage:
 *   npm run refresh
 */

import { performRefresh } from '../services/refresh';

async function main(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Daily refresh starting...`);
  try {
    const result = await performRefresh();
    const duration = result.completedAt.getTime() - result.startedAt.getTime();
    console.log(`[${new Date().toISOString()}] Done in ${(duration / 1000).toFixed(1)}s — status: ${result.status}, ok: ${result.sourcesOk}, failed: ${result.sourcesFailed}`);
    process.exit(0);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Refresh failed:`, (err as Error).message);
    process.exit(1);
  }
}

main();
