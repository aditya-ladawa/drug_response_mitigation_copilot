/**
 * One-shot verification script.
 * Runs two consecutive refreshes and checks that row counts are identical
 * (proves idempotent rebuild — no 2x duplication).
 *
 * Usage: npx ts-node-dev --transpile-only src/scripts/verify-refresh.ts
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';
import { runChecks } from '../services/dataAccess';
import { runIngestion } from '../services/ingestion';

function countRow(table: string): number {
  const row = db.all(sql.raw(`SELECT count(*) as c FROM ${table}`)) as Array<{ c: number }>;
  return row[0]?.c ?? 0;
}

function snapshot(): Record<string, number> {
  const tables = [
    'drugs',
    'manufacturers',
    'ndcs',
    'shortage_records',
    'recall_events',
    'warning_letters',
    'import_alerts',
    'establishments',
    'orange_book_entries',
    'spl_labels',
    'news_signals',
    'refresh_log',
  ];
  return Object.fromEntries(tables.map((t) => [t, countRow(t)]));
}

function printSnapshot(label: string, snap: Record<string, number>): void {
  console.log(`\n──── ${label} ────`);
  for (const [t, c] of Object.entries(snap)) {
    console.log(`  ${t.padEnd(22)} ${c.toLocaleString()}`);
  }
}

async function main(): Promise<void> {
  const skipFetch = process.argv.includes('--skip-fetch');

  if (!skipFetch) {
    console.log('[1/3] Fetching all sources (this takes ~30-90s)...');
    const fetched = await runChecks();
    const ok = fetched.filter((r) => r.ok).length;
    console.log(`      → ${ok}/${fetched.length} sources fetched successfully`);
  } else {
    console.log('[1/3] --skip-fetch — using existing artifacts');
  }

  console.log('\n[2/3] First ingestion...');
  const r1 = await runIngestion();
  const snap1 = snapshot();
  printSnapshot('After 1st ingest', snap1);
  console.log(`  status: ${r1.status}, ok: ${r1.sourcesOk}, failed: ${r1.sourcesFailed}`);

  console.log('\n[3/3] Second ingestion (same artifacts — must be idempotent)...');
  const r2 = await runIngestion();
  const snap2 = snapshot();
  printSnapshot('After 2nd ingest', snap2);
  console.log(`  status: ${r2.status}, ok: ${r2.sourcesOk}, failed: ${r2.sourcesFailed}`);

  console.log('\n──── Idempotency check ────');
  let drift = false;
  for (const t of Object.keys(snap1)) {
    if (t === 'refresh_log') continue; // expected to grow
    if (snap1[t] !== snap2[t]) {
      console.log(`  ❌ ${t}: ${snap1[t]} → ${snap2[t]} (DRIFT)`);
      drift = true;
    } else {
      console.log(`  ✓  ${t}: ${snap1[t]}`);
    }
  }
  if (drift) {
    console.log('\n❌ IDEMPOTENCY FAILED — rows changed between runs');
    process.exit(1);
  }
  console.log('\n✓ IDEMPOTENT — row counts stable across refreshes');
}

main().catch((err) => {
  console.error('[Test] Failed:', err);
  process.exit(1);
});
