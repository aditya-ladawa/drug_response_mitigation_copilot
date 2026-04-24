import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import { WarningLetter } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

/**
 * XLSX is the primary source (1000 rows with full metadata) but lacks URLs.
 * HTML has the 10 most recent letters WITH URLs. We merge: XLSX drives the
 * row set; for each row, we look up a matching (company, issue date) pair in
 * the HTML and attach its URL if found. Most rows stay URL-less (index page
 * is paginated and we only cache page 1); that's an accepted limitation.
 */

interface PlaywrightUrlRecord {
  company: string;
  issueDate: string;
  postedDate: string;
  url: string;
}

/**
 * Build a (company + issueDate) → URL lookup from two sources, in priority order:
 *   1. Playwright-collected artifact (fda_warning_letter_urls.json) — full 1,000+ URLs
 *   2. HTML page (fda_warning_letters_page.html) — fallback, covers only ~10 rows
 */
function buildUrlIndex(): Map<string, string> {
  const urlByKey = new Map<string, string>();

  // Source 1: Playwright artifact (best — full coverage)
  const playwrightPath = path.join(ARTIFACTS_DIR, 'fda_warning_letter_urls.json');
  if (fs.existsSync(playwrightPath)) {
    const records: PlaywrightUrlRecord[] = JSON.parse(fs.readFileSync(playwrightPath, 'utf8'));
    for (const r of records) {
      if (r.company && r.url) {
        urlByKey.set(makeKey(r.company, r.issueDate), r.url);
      }
    }
    return urlByKey; // Full coverage — no need for HTML fallback
  }

  // Source 2: HTML page fallback (only ~10 rows)
  const htmlPath = path.join(ARTIFACTS_DIR, 'fda_warning_letters_page.html');
  if (!fs.existsSync(htmlPath)) return urlByKey;

  const html = fs.readFileSync(htmlPath, 'utf8');
  const $ = cheerio.load(html);

  $('table tbody tr, table tr').each((_i, row) => {
    const $row = $(row);
    const tds = $row.find('td');
    if (tds.length < 3) return;

    const issueRaw = $(tds[1]).find('time').attr('datetime') ?? $(tds[1]).text();
    const issueDate = normalizeDate(issueRaw);
    const $companyLink = $(tds[2]).find('a').first();
    const company = $companyLink.text().trim();
    const href = $companyLink.attr('href') ?? '';
    if (!company || !href) return;

    const url = href.startsWith('http') ? href : `https://www.fda.gov${href}`;
    const key = makeKey(company, issueDate);
    if (!urlByKey.has(key)) urlByKey.set(key, url);
  });

  return urlByKey;
}

function normalizeDate(raw: string): string {
  // Accept either "2026-03-23T04:00:00Z" or "03/23/2026" — output "03/23/2026"
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return trimmed;
}

function makeKey(company: string, issueDate: string): string {
  return `${company.toLowerCase().replace(/\s+/g, ' ').trim()}|${issueDate}`;
}

interface XlsxRow {
  'Posted Date'?: string;
  'Letter Issue Date'?: string;
  'Company Name'?: string;
  'Issuing Office'?: string;
  Subject?: string;
  'Closeout Letter'?: string;
}

export function parseWarningLettersXlsx(): WarningLetter[] {
  const filePath = path.join(ARTIFACTS_DIR, 'fda_warning_letters_xlsx.xlsx');
  if (!fs.existsSync(filePath)) {
    throw new Error('Warning letters XLSX artifact not found');
  }

  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<XlsxRow>(sheet);

  const urlIndex = buildUrlIndex();
  const FDA_SEARCH_BASE =
    'https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters';

  return rows
    .map((r) => {
      const company = (r['Company Name'] ?? '').trim();
      const issueDate = (r['Letter Issue Date'] ?? '').trim();
      const key = makeKey(company, issueDate);
      // Prefer the exact URL from HTML; otherwise fall back to a company
      // search URL so the agent has something citable.
      const url =
        urlIndex.get(key) ??
        (company
          ? `${FDA_SEARCH_BASE}?search_api_fulltext=${encodeURIComponent(company)}`
          : FDA_SEARCH_BASE);

      return {
        company,
        subject: (r.Subject ?? '').trim(),
        issueDate,
        postedDate: (r['Posted Date'] ?? '').trim(),
        issuingOffice: (r['Issuing Office'] ?? '').trim(),
        letterId: '',
        url,
      };
    })
    .filter((r) => r.company.length > 0);
}
