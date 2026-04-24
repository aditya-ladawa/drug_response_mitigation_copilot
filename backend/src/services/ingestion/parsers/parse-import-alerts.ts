import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { ImportAlert } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

/**
 * FDA import alert search results have this shape (flat siblings inside a result div):
 *   <div class="content-block-item result">
 *     <h4 class="title"><a href="...">Import Alert 66-79</a></h4>
 *     <span class="url">https://...</span>
 *     <span class="description">Examination of Drugs...</span>
 *
 *     <h4 class="title"><a href="...">Import Alert 66-40</a></h4>
 *     <span class="url">...</span>
 *     <span class="description">...</span>
 *   </div>
 *
 * Note: the FDA search endpoint does NOT return a per-alert firm name or country —
 * those are embedded in individual alert detail pages. We record what we have
 * (alert number + charge description + link) and leave firm/country blank.
 */
export function parseImportAlerts(): ImportAlert[] {
  const filePath = path.join(ARTIFACTS_DIR, 'fda_import_alerts.html');
  if (!fs.existsSync(filePath)) {
    throw new Error('Import alerts artifact not found');
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);
  const records: ImportAlert[] = [];
  const seen = new Set<string>();

  $('h4.title').each((_i, titleEl) => {
    const $title = $(titleEl);
    const aEl = $title.find('a').first();
    const text = aEl.text().trim();

    if (!text.toLowerCase().includes('import alert')) return;

    const url = aEl.attr('href') ?? '';
    // Walk forward siblings up to the NEXT h4.title; the description is between.
    const description = $title
      .nextUntil('h4.title', '.description')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    // Dedup by alertNumber (same alert might appear multiple times in search results)
    if (seen.has(text)) return;
    seen.add(text);

    records.push({
      alertNumber: text,
      product: '',
      firm: '',
      country: '',
      charge: description,
      url: url.startsWith('http') ? url : `https://www.accessdata.fda.gov${url}`,
    });
  });

  return records;
}
