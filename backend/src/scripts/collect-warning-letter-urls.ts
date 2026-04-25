/**
 * One-time Playwright script to collect direct FDA warning letter URLs.
 *
 * The FDA warning letters page uses JavaScript DataTables (3,429 entries,
 * 10 per page by default). This script launches a headless browser, optionally
 * increases page size to 100, paginates through all pages, and saves results to:
 *   artifacts/fda_warning_letter_urls.json
 *
 * The XLSX export is limited to 1,000 rows — this script gets ALL 3,429.
 *
 * Usage:  npm run collect-warning-letters
 * Runtime: ~2-3 minutes (35 pages × ~4s each at 100/page)
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../artifacts');
const OUTPUT_FILE = path.join(ARTIFACTS_DIR, 'fda_warning_letter_urls.json');
const WARNING_LETTERS_URL =
  'https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters';

export interface WarningLetterUrl {
  company: string;
  issueDate: string;
  postedDate: string;
  url: string;
}

async function extractRows(page: import('playwright').Page): Promise<WarningLetterUrl[]> {
  return page.$$eval('table#datatable tbody tr', (trs) =>
    trs
      .map((tr) => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 3) return null;
        const postedDate = cells[0]?.textContent?.trim() ?? '';
        const issueDate = cells[1]?.textContent?.trim() ?? '';
        const anchor = cells[2]?.querySelector('a');
        const company = anchor?.textContent?.trim() ?? cells[2]?.textContent?.trim() ?? '';
        const href = anchor?.href ?? '';
        if (!company || !href) return null;
        return { company, issueDate, postedDate, url: href };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
  );
}

async function collectUrls(): Promise<WarningLetterUrl[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log('[Playwright] Navigating to FDA warning letters page...');
  await page.goto(WARNING_LETTERS_URL, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForSelector('table#datatable tbody tr td', { timeout: 30_000 });
  await page.waitForTimeout(1_500);

  // Try to set page size to 100 to reduce number of clicks needed
  const pageSizeSelect = await page.$('select[name="datatable_length"]');
  if (pageSizeSelect) {
    await pageSizeSelect.selectOption('100');
    await page.waitForTimeout(2_000);
    console.log('[Playwright] Set page size to 100');
  } else {
    console.log('[Playwright] Page size selector not found — using default (10/page)');
  }

  const all: WarningLetterUrl[] = [];
  let pageNum = 1;
  const MAX_PAGES = 400; // Safety ceiling

  while (pageNum <= MAX_PAGES) {
    const rows = await extractRows(page);
    all.push(...rows);

    // Info text shows "Showing X to Y of Z entries"
    const info = await page.$eval('.dataTables_info', (el) => el.textContent ?? '').catch(() => '');
    console.log(`[Playwright] Page ${pageNum}: ${rows.length} rows — total ${all.length}  ${info.trim()}`);

    // Next button: id="datatable_next"; disabled when on last page
    const nextDisabled = await page.$('#datatable_next.disabled').catch(() => null);
    if (nextDisabled) {
      console.log('[Playwright] Last page reached.');
      break;
    }

    const nextLink = await page.$('#datatable_next a.page-link');
    if (!nextLink) {
      console.log('[Playwright] Next link not found — stopping.');
      break;
    }

    await nextLink.click();
    await page.waitForTimeout(2_500); // Wait for DataTables to update
    pageNum++;
  }

  await browser.close();
  return all;
}

async function main(): Promise<void> {
  const start = Date.now();
  console.log('[collect-warning-letters] Starting...');

  let urls: WarningLetterUrl[];
  try {
    urls = await collectUrls();
  } catch (err) {
    console.error('[collect-warning-letters] Failed:', (err as Error).message);
    process.exit(1);
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(urls, null, 2));

  const durationS = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[collect-warning-letters] Done: ${urls.length} URLs saved to artifacts/fda_warning_letter_urls.json in ${durationS}s`,
  );
}

main();
