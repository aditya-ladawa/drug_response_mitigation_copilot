import { db } from '../../db';
import {
  drugs,
  ndcs,
  manufacturers,
  establishments,
  shortageRecords,
  recallEvents,
  warningLetters,
  importAlerts,
  orangeBookEntries,
  splLabels,
  newsSignals,
  refreshLog,
} from '../../db/schema';
import {
  IngestionResult,
  RefreshResult,
  Drug,
  Manufacturer,
  NDCRecord,
  ShortageRecord,
  RecallEvent,
  WarningLetter,
  ImportAlert,
  Establishment,
  OrangeBookEntry,
  SPLLabel,
  NewsSignal,
} from '../../types';
import {
  deduplicateDrugs,
  deduplicateManufacturers,
  buildDrugNameToIdMap,
  buildManufacturerNameToIdMap,
  normalizeManufacturerName,
  resolveDrugId,
} from './entity-resolver';
import { invalidateGraph } from '../graph';
import { parseAshpShortages } from './parsers/parse-ashp';
import { parseDailyMed } from './parsers/parse-dailymed';
import { parseEnforcement } from './parsers/parse-enforcement';
import { parseEstablishments } from './parsers/parse-establishments';
import { parseFdaShortages } from './parsers/parse-fda-shortages';
import { parseGdelt } from './parsers/parse-gdelt';
import { parseImportAlerts } from './parsers/parse-import-alerts';
import { parseNdc } from './parsers/parse-ndc';
import { parseOrangeBook } from './parsers/parse-orange-book';
import { parseWarningLettersHtml } from './parsers/parse-warning-letters';
import { parseWarningLettersXlsx } from './parsers/parse-warning-letters-xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: parse every source once, isolate failures per source.
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedArtifacts {
  fdaShortages: ShortageRecord[];
  ashpShortages: ShortageRecord[];
  ndcRecords: NDCRecord[];
  recalls: RecallEvent[];
  warningLetterList: WarningLetter[];
  importAlertList: ImportAlert[];
  establishmentList: Establishment[];
  orangeBook: OrangeBookEntry[];
  splLabelList: SPLLabel[];
  news: NewsSignal[];
  parseErrors: Array<{ source: string; error: string }>;
}

function safeParse<T>(source: string, parser: () => T[], errors: Array<{ source: string; error: string }>): T[] {
  try {
    return parser();
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[Ingestion] parse failed for ${source}: ${msg}`);
    errors.push({ source, error: msg });
    return [];
  }
}

function parseWarningLettersWithFallback(errors: Array<{ source: string; error: string }>): WarningLetter[] {
  try {
    const xlsx = parseWarningLettersXlsx();
    if (xlsx.length > 0) return xlsx;
    throw new Error('XLSX parser returned 0 rows');
  } catch (xlsxErr) {
    try {
      return parseWarningLettersHtml();
    } catch (htmlErr) {
      const msg = `XLSX: ${(xlsxErr as Error).message}; HTML: ${(htmlErr as Error).message}`;
      console.warn(`[Ingestion] parse failed for Warning Letters: ${msg}`);
      errors.push({ source: 'Warning Letters', error: msg });
      return [];
    }
  }
}

function parseAllArtifacts(): ParsedArtifacts {
  const parseErrors: Array<{ source: string; error: string }> = [];
  return {
    fdaShortages: safeParse('FDA Shortages', parseFdaShortages, parseErrors),
    ashpShortages: safeParse('ASHP Shortages', parseAshpShortages, parseErrors),
    ndcRecords: safeParse('NDC', parseNdc, parseErrors),
    recalls: safeParse('Enforcement', parseEnforcement, parseErrors),
    warningLetterList: parseWarningLettersWithFallback(parseErrors),
    importAlertList: safeParse('Import Alerts', parseImportAlerts, parseErrors),
    establishmentList: safeParse('Establishments', parseEstablishments, parseErrors),
    orangeBook: safeParse('Orange Book', parseOrangeBook, parseErrors),
    splLabelList: safeParse('DailyMed', parseDailyMed, parseErrors),
    news: safeParse('GDELT', parseGdelt, parseErrors),
    parseErrors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: build deduplicated reference entities (drugs, manufacturers).
// ─────────────────────────────────────────────────────────────────────────────

function buildDrugList(parsed: ParsedArtifacts): Drug[] {
  const candidates: Drug[] = [];

  for (const s of parsed.fdaShortages) {
    if (s.drugName) candidates.push({ genericName: s.drugName });
  }
  for (const s of parsed.ashpShortages) {
    if (s.drugName) candidates.push({ genericName: s.drugName });
  }
  for (const r of parsed.ndcRecords) {
    const name = r.genericName || r.brandName;
    if (!name) continue;
    candidates.push({
      genericName: name,
      brandNames: r.brandName ? [r.brandName] : [],
      activeIngredients: r.activeIngredients,
      therapeuticClass: r.pharmClass?.[0] ?? null,
    });
  }
  for (const ob of parsed.orangeBook) {
    if (ob.ingredient) {
      candidates.push({
        genericName: ob.ingredient,
        brandNames: ob.tradeName ? [ob.tradeName] : [],
      });
    }
  }

  return deduplicateDrugs(candidates);
}

function buildManufacturerList(parsed: ParsedArtifacts): Manufacturer[] {
  const candidates: Manufacturer[] = [];
  const push = (name: string | undefined | null): void => {
    if (!name) return;
    const normalized = normalizeManufacturerName(name);
    if (!normalized) return;
    candidates.push({ name, normalizedName: normalized });
  };

  for (const r of parsed.ndcRecords) push(r.labelerName);
  for (const r of parsed.recalls) push(r.recallingFirm);
  for (const w of parsed.warningLetterList) push(w.company);
  for (const e of parsed.establishmentList) push(e.name);
  for (const ia of parsed.importAlertList) push(ia.firm);

  return deduplicateManufacturers(candidates);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: DB wipe + rebuild in a single transaction (idempotent refresh).
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 200;

function inBatches<T>(arr: T[]): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += BATCH_SIZE) {
    batches.push(arr.slice(i, i + BATCH_SIZE));
  }
  return batches;
}

interface RebuildCounts {
  drugs: number;
  manufacturers: number;
  ndcs: number;
  shortages: number;
  recalls: number;
  warningLetters: number;
  importAlerts: number;
  establishments: number;
  orangeBook: number;
  splLabels: number;
  newsSignals: number;
}

function rebuildDatabase(parsed: ParsedArtifacts, drugList: Drug[], manufacturerList: Manufacturer[]): RebuildCounts {
  return db.transaction((): RebuildCounts => {
    // 1. Wipe all data tables (leave refresh_log intact for history)
    db.delete(ndcs).run();
    db.delete(shortageRecords).run();
    db.delete(recallEvents).run();
    db.delete(warningLetters).run();
    db.delete(importAlerts).run();
    db.delete(orangeBookEntries).run();
    db.delete(establishments).run();
    db.delete(splLabels).run();
    db.delete(newsSignals).run();
    db.delete(drugs).run();
    db.delete(manufacturers).run();

    // 2. Insert reference entities
    let drugsInserted = 0;
    for (const batch of inBatches(drugList)) {
      const result = db
        .insert(drugs)
        .values(
          batch.map((d) => ({
            genericName: d.genericName,
            brandNames: d.brandNames ?? [],
            activeIngredients: d.activeIngredients ?? [],
            therapeuticClass: d.therapeuticClass ?? null,
          })),
        )
        .run();
      drugsInserted += result.changes ?? 0;
    }

    let mfrsInserted = 0;
    for (const batch of inBatches(manufacturerList)) {
      const result = db
        .insert(manufacturers)
        .values(batch.map((m) => ({ name: m.name, normalizedName: m.normalizedName })))
        .run();
      mfrsInserted += result.changes ?? 0;
    }

    // 3. Build FK lookup maps from just-inserted rows
    const drugRows = db.select({ id: drugs.id, genericName: drugs.genericName, brandNames: drugs.brandNames }).from(drugs).all();
    const mfrRows = db.select({ id: manufacturers.id, name: manufacturers.name, normalizedName: manufacturers.normalizedName }).from(manufacturers).all();
    const drugIdByName = buildDrugNameToIdMap(drugRows);
    const mfrIdByName = buildManufacturerNameToIdMap(mfrRows);

    // 4. Insert NDCs with drug FK resolved
    let ndcsInserted = 0;
    for (const batch of inBatches(parsed.ndcRecords)) {
      const rows = batch
        .filter((r) => r.productNdc)
        .map((r) => ({
          ndcCode: r.productNdc,
          drugId: resolveDrugId(r.genericName || r.brandName, drugIdByName),
          labeler: r.labelerName || null,
          dosageForm: r.dosageForm || null,
          route: r.route ?? [],
          packageDescription: r.packaging?.[0]?.description ?? null,
          marketingStartDate: r.marketingStartDate || null,
        }));
      if (rows.length === 0) continue;
      const result = db.insert(ndcs).values(rows).run();
      ndcsInserted += result.changes ?? 0;
    }

    // 5. Insert shortages with drug FK resolved
    const allShortages = [...parsed.fdaShortages, ...parsed.ashpShortages];
    let shortagesInserted = 0;
    for (const batch of inBatches(allShortages)) {
      const rows = batch.map((s) => ({
        drugId: resolveDrugId(s.drugName, drugIdByName),
        drugName: s.drugName,
        status: s.status,
        source: s.source,
        sourceUrl: s.url ?? null,
        startDate: s.startDate ?? null,
        endDate: s.endDate ?? null,
      }));
      const result = db.insert(shortageRecords).values(rows).run();
      shortagesInserted += result.changes ?? 0;
    }

    // 6. Recalls — resolve drug + manufacturer FKs by name
    let recallsInserted = 0;
    for (const batch of inBatches(parsed.recalls)) {
      const rows = batch
        .filter((r) => r.recallNumber || r.product)
        .map((r) => ({
          recallNumber: r.recallNumber || `unknown-${Math.random().toString(36).slice(2, 10)}`,
          product: r.product || '',
          reason: r.reason || null,
          classification: r.classification || null,
          recallDate: r.recallDate || null,
          firm: r.recallingFirm || null,
          status: r.status || null,
          city: r.city || null,
          state: r.state || null,
          country: r.country || null,
          codeInfo: r.codeInfo || null,
          drugId: resolveDrugId(r.product, drugIdByName),
          manufacturerId: r.recallingFirm
            ? mfrIdByName.get(normalizeManufacturerName(r.recallingFirm)) ?? null
            : null,
        }));
      if (rows.length === 0) continue;
      const result = db.insert(recallEvents).values(rows).run();
      recallsInserted += result.changes ?? 0;
    }

    // 7. Warning letters
    let warningsInserted = 0;
    for (const batch of inBatches(parsed.warningLetterList)) {
      const rows = batch
        .filter((w) => w.company)
        .map((w) => ({
          company: w.company,
          subject: w.subject || null,
          issueDate: w.issueDate || null,
          postedDate: w.postedDate || null,
          issuingOffice: w.issuingOffice || null,
          letterId: w.letterId || null,
          url: w.url || null,
          manufacturerId: w.company
            ? mfrIdByName.get(normalizeManufacturerName(w.company)) ?? null
            : null,
        }));
      if (rows.length === 0) continue;
      const result = db.insert(warningLetters).values(rows).run();
      warningsInserted += result.changes ?? 0;
    }

    // 8. Import alerts
    let importsInserted = 0;
    for (const batch of inBatches(parsed.importAlertList)) {
      const rows = batch
        .filter((a) => a.alertNumber)
        .map((a) => ({
          alertNumber: a.alertNumber,
          product: a.product || null,
          firm: a.firm || null,
          country: a.country || null,
          charge: a.charge || null,
          url: a.url || null,
          manufacturerId: a.firm ? mfrIdByName.get(normalizeManufacturerName(a.firm)) ?? null : null,
        }));
      if (rows.length === 0) continue;
      const result = db.insert(importAlerts).values(rows).run();
      importsInserted += result.changes ?? 0;
    }

    // 9. Establishments
    let establishmentsInserted = 0;
    for (const batch of inBatches(parsed.establishmentList)) {
      const rows = batch
        .filter((e) => e.name)
        .map((e) => ({
          feiNumber: e.feiNumber || null,
          name: e.name,
          address: e.address || null,
          city: e.city || null,
          state: e.state || null,
          country: e.country || null,
          operations: e.operations || null,
          manufacturerId: mfrIdByName.get(normalizeManufacturerName(e.name)) ?? null,
        }));
      if (rows.length === 0) continue;
      const result = db.insert(establishments).values(rows).run();
      establishmentsInserted += result.changes ?? 0;
    }

    // 10. Orange Book — link to drugs via ingredient name
    let orangeInserted = 0;
    for (const batch of inBatches(parsed.orangeBook)) {
      const rows = batch
        .filter((ob) => ob.ingredient)
        .map((ob) => ({
          ingredient: ob.ingredient,
          tradeName: ob.tradeName || null,
          applicant: ob.applicant || null,
          teCode: ob.teCode || null,
          type: ob.type || null,
          rldFlag: ob.rldFlag || null,
          drugId: resolveDrugId(ob.ingredient, drugIdByName),
        }));
      if (rows.length === 0) continue;
      const result = db.insert(orangeBookEntries).values(rows).run();
      orangeInserted += result.changes ?? 0;
    }

    // 11. DailyMed SPL labels
    let splsInserted = 0;
    for (const batch of inBatches(parsed.splLabelList)) {
      const rows = batch
        .filter((l) => l.setId)
        .map((l) => ({
          setId: l.setId,
          title: l.title || null,
          effectiveDate: l.publishedDate || null,
          labeler: l.labeler || null,
        }));
      if (rows.length === 0) continue;
      const result = db.insert(splLabels).values(rows).run();
      splsInserted += result.changes ?? 0;
    }

    // 12. News signals (GDELT)
    let newsInserted = 0;
    for (const batch of inBatches(parsed.news)) {
      const rows = batch
        .filter((n) => n.title)
        .map((n) => ({
          title: n.title,
          url: n.url || null,
          publishDate: n.seenDate || null,
          domain: n.domain || null,
          language: n.language || null,
          sourceCountry: n.sourcecountry || null,
        }));
      if (rows.length === 0) continue;
      const result = db.insert(newsSignals).values(rows).run();
      newsInserted += result.changes ?? 0;
    }

    return {
      drugs: drugsInserted,
      manufacturers: mfrsInserted,
      ndcs: ndcsInserted,
      shortages: shortagesInserted,
      recalls: recallsInserted,
      warningLetters: warningsInserted,
      importAlerts: importsInserted,
      establishments: establishmentsInserted,
      orangeBook: orangeInserted,
      splLabels: splsInserted,
      newsSignals: newsInserted,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point.
// ─────────────────────────────────────────────────────────────────────────────

export async function runIngestion(): Promise<RefreshResult> {
  const startedAt = new Date();
  const perSource: IngestionResult[] = [];
  let sourcesOk = 0;
  let sourcesFailed = 0;

  // Parse all artifacts (each source isolated; individual failures don't abort)
  const parsed = parseAllArtifacts();

  // Build reference entity lists (synchronous, in-memory)
  const drugList = buildDrugList(parsed);
  const manufacturerList = buildManufacturerList(parsed);

  // Rebuild DB in a single transaction — idempotent across refreshes
  let counts: RebuildCounts;
  try {
    counts = rebuildDatabase(parsed, drugList, manufacturerList);
  } catch (err) {
    const error = err as Error;
    console.error('[Ingestion] DB rebuild failed:', error.message);

    const completedAt = new Date();
    db.insert(refreshLog)
      .values({
        startedAt,
        completedAt,
        status: 'failed',
        sourcesOk: 0,
        sourcesFailed: 1,
        notes: `DB rebuild failed: ${error.message}`,
      })
      .run();

    throw error;
  }

  // Record per-source results (for the API response)
  const sourceCounts: Array<[string, number]> = [
    ['FDA Shortages', parsed.fdaShortages.length],
    ['ASHP Shortages', parsed.ashpShortages.length],
    ['NDC', counts.ndcs],
    ['Enforcement', counts.recalls],
    ['Warning Letters', counts.warningLetters],
    ['Import Alerts', counts.importAlerts],
    ['Establishments', counts.establishments],
    ['Orange Book', counts.orangeBook],
    ['DailyMed', counts.splLabels],
    ['GDELT', counts.newsSignals],
  ];

  for (const [source, inserted] of sourceCounts) {
    const parseErr = parsed.parseErrors.find((e) => e.source === source);
    if (parseErr) {
      perSource.push({ source, inserted: 0, errors: 1, durationMs: 0 });
      sourcesFailed++;
    } else {
      perSource.push({ source, inserted, errors: 0, durationMs: 0 });
      sourcesOk++;
    }
  }

  const completedAt = new Date();
  const status: RefreshResult['status'] =
    sourcesFailed === 0 ? 'success' : sourcesOk > 0 ? 'partial' : 'failed';

  const totalInserted = Object.values(counts).reduce((a, b) => a + b, 0);

  db.insert(refreshLog)
    .values({
      startedAt,
      completedAt,
      status,
      sourcesOk,
      sourcesFailed,
      notes: `drugs=${counts.drugs} mfrs=${counts.manufacturers} ndcs=${counts.ndcs} shortages=${counts.shortages} recalls=${counts.recalls} warnings=${counts.warningLetters} imports=${counts.importAlerts} estabs=${counts.establishments} orange=${counts.orangeBook} spls=${counts.splLabels} news=${counts.newsSignals} total=${totalInserted}`,
    })
    .run();

  // DB changed → graph cache is stale; next graph access will rebuild.
  invalidateGraph();

  console.log(
    `[Ingestion] done: ${sourcesOk} ok, ${sourcesFailed} failed, ${totalInserted} rows total ` +
      `(${completedAt.getTime() - startedAt.getTime()}ms)`,
  );

  return {
    startedAt,
    completedAt,
    status,
    results: perSource,
    sourcesOk,
    sourcesFailed,
  };
}
