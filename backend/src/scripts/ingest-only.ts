/**
 * Ingest-only: parse existing artifacts into SQLite.
 * Does NOT fetch from the network — useful when you already ran `npm run refresh`
 * or when iterating on parsers without hitting APIs.
 *
 * Usage: npm run ingest
 */

import { runIngestion } from '../services/ingestion';

async function main(): Promise<void> {
  try {
    const result = await runIngestion();
    const duration = result.completedAt.getTime() - result.startedAt.getTime();
    console.log(
      `Done in ${(duration / 1000).toFixed(1)}s — status: ${result.status}, ok: ${result.sourcesOk}, failed: ${result.sourcesFailed}`,
    );
    process.exit(0);
  } catch (err) {
    console.error('Ingest failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
