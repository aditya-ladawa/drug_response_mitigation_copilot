import { SourceResult } from '../../types';
import {
  fetchAshpSource,
  fetchBinarySource,
  fetchCmsCatalog,
  fetchCmsDatasetJson,
  fetchGdeltSource,
  fetchHtmlSource,
  fetchImportAlertSearch,
  fetchJsonSource,
  fetchZipSource,
} from './sources';

type SourceCheck = [string, () => Promise<SourceResult>];

const SOURCE_CHECKS: SourceCheck[] = [
  [
    'FDA Drug Shortages',
    () =>
      fetchHtmlSource(
        'FDA Drug Shortages',
        'https://www.accessdata.fda.gov/scripts/drugshortages/default.cfm',
      ),
  ],
  [
    'openFDA Drug Enforcement',
    () =>
      fetchJsonSource(
        'openFDA Drug Enforcement',
        'https://api.fda.gov/drug/enforcement.json?limit=3',
      ),
  ],
  [
    'FDA Warning Letters Page',
    () =>
      fetchHtmlSource(
        'FDA Warning Letters Page',
        'https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters',
      ),
  ],
  [
    'FDA Warning Letters XLSX',
    () =>
      fetchBinarySource(
        'FDA Warning Letters XLSX',
        'https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters/datatables-data?page&_format=xlsx',
        '.xlsx',
      ),
  ],
  ['FDA Import Alerts', () => fetchImportAlertSearch('FDA Import Alerts')],
  [
    'openFDA NDC',
    () => fetchJsonSource('openFDA NDC', 'https://api.fda.gov/drug/ndc.json?limit=3'),
  ],
  [
    'DailyMed SPLs',
    () =>
      fetchJsonSource(
        'DailyMed SPLs',
        'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?page=1&pagesize=3',
      ),
  ],
  [
    'FDA Drug Establishments',
    () =>
      fetchZipSource(
        'FDA Drug Establishments',
        'https://www.accessdata.fda.gov/cder/drls_reg.zip',
      ),
  ],
  [
    'FDA Orange Book',
    () =>
      fetchZipSource(
        'FDA Orange Book',
        'https://www.fda.gov/media/76860/download?attachment',
      ),
  ],
  ['GDELT DOC API', () => fetchGdeltSource('GDELT DOC API')],
  ['ASHP Drug Shortages', () => fetchAshpSource('ASHP Drug Shortages')],
  [
    'CMS Medicare Part D',
    () =>
      fetchCmsDatasetJson(
        'CMS Medicare Part D',
        'https://data.cms.gov/data-api/v1/dataset/e54db557-cd82-4e91-a0fe-61aad5865d69/data?size=3',
      ),
  ],
  [
    'CMS Open Payments',
    () => fetchCmsCatalog('CMS Open Payments', 'https://openpaymentsdata.cms.gov/data.json'),
  ],
];

export async function runChecks(): Promise<SourceResult[]> {
  const results: SourceResult[] = [];

  for (const [name, check] of SOURCE_CHECKS) {
    try {
      results.push(await check());
    } catch (err) {
      const error = err as Error & {
        response?: { status: number; statusText: string };
        code?: string;
      };
      let summary: string;
      if (error.response) {
        summary = `HTTP ${error.response.status}: ${error.response.statusText}`;
      } else if (error.code) {
        summary = `Network error: ${error.code}`;
      } else {
        summary = `${error.constructor.name}: ${error.message}`;
      }
      results.push({ name, kind: 'error', url: '', ok: false, summary, artifact: null });
    }
  }

  return results;
}

function printResults(results: SourceResult[]): void {
  const okCount = results.filter((r) => r.ok).length;
  console.log(
    `Checked ${results.length} sources; successful=${okCount}; failed_or_manual=${results.length - okCount}\n`,
  );
  for (const result of results) {
    const status = result.ok ? 'OK' : 'SKIP/FAIL';
    console.log(`[${status}] ${result.name}`);
    console.log(`  kind: ${result.kind}`);
    if (result.url) console.log(`  url: ${result.url}`);
    console.log(`  summary: ${result.summary}`);
    if (result.artifact) console.log(`  artifact: ${result.artifact}`);
    console.log();
  }
}

if (require.main === module) {
  runChecks().then((results) => {
    printResults(results);
    process.exit(results.some((r) => r.ok) ? 0 : 1);
  });
}
