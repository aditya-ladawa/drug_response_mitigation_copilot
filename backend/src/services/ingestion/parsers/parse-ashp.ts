import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { ShortageRecord } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');
const ASHP_LIST_URL =
  'https://www.ashp.org/Drug-Shortages/Current-Shortages/drug-shortages-list?page=CurrentShortages';

// Anchor selectors that reliably point at shortage detail pages on ASHP.
// If we see any of these, we're on a real list page — otherwise it's the nav
// skeleton and we return empty (never fall back to scraping arbitrary <li>s,
// which would produce garbage like "Login", "Join ASHP", etc).
const DETAIL_LINK_PATTERN = /\/Drug-Shortages\/.*\/Current-Shortage-List-Detail/i;

export function parseAshpShortages(): ShortageRecord[] {
  const filePath = path.join(ARTIFACTS_DIR, 'ashp_drug_shortages.html');
  if (!fs.existsSync(filePath)) {
    throw new Error('ASHP shortages artifact not found');
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);
  const records: ShortageRecord[] = [];
  const seen = new Set<string>();

  // Strategy 1: table rows — the list page renders shortages in a table.
  $('table tbody tr, table tr').each((_i, row) => {
    const $row = $(row);
    const tds = $row.find('td');
    if (tds.length < 2) return;

    const $firstLink = $(tds[0]).find('a').first();
    const href = $firstLink.attr('href') ?? '';
    const drugName = $firstLink.text().trim() || $(tds[0]).text().trim();
    if (!drugName || drugName.length < 3) return;

    const status = $(tds[1]).text().trim() || 'Current Shortage';
    const url = href
      ? href.startsWith('http')
        ? href
        : `https://www.ashp.org${href.startsWith('/') ? '' : '/'}${href}`
      : ASHP_LIST_URL;

    const dedupKey = drugName.toLowerCase();
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);

    records.push({ drugName, status, source: 'ASHP', url });
  });

  // Strategy 2: detail links anywhere in the page (ASHP sometimes renders
  // shortages as a link list instead of a table). Strict: only accept anchors
  // that actually point at shortage detail pages.
  if (records.length === 0) {
    $('a').each((_i, a) => {
      const href = $(a).attr('href') ?? '';
      if (!DETAIL_LINK_PATTERN.test(href)) return;

      const drugName = $(a).text().trim();
      if (!drugName || drugName.length < 3) return;

      const dedupKey = drugName.toLowerCase();
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

      records.push({
        drugName,
        status: 'Current Shortage',
        source: 'ASHP',
        url: href.startsWith('http') ? href : `https://www.ashp.org${href}`,
      });
    });
  }

  return records;
}
