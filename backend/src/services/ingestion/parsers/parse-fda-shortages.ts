import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { ShortageRecord } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');
const FDA_SHORTAGE_BASE = 'https://www.accessdata.fda.gov/scripts/drugshortages/';

export function parseFdaShortages(): ShortageRecord[] {
  const filePath = path.join(ARTIFACTS_DIR, 'fda_drug_shortages.html');
  if (!fs.existsSync(filePath)) {
    throw new Error('FDA shortages artifact not found');
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);
  const records: ShortageRecord[] = [];

  // FDA renders two tables: #cont (current shortages) + #dis (discontinued)
  const tableStatusFallback = (id: string): string =>
    id === 'dis' ? 'Discontinued' : 'Currently in Shortage';

  $('table').each((_ti, table) => {
    const tableId = $(table).attr('id') ?? '';
    const defaultStatus = tableStatusFallback(tableId);

    $(table)
      .find('tbody tr, tr')
      .each((_ri, row) => {
        const tds = $(row).find('td');
        if (tds.length === 0) return; // header row

        const firstCell = $(tds[0]);
        const drugName = firstCell.text().trim();
        if (!drugName) return;

        const href = firstCell.find('a').attr('href') ?? '';
        const url = href
          ? href.startsWith('http')
            ? href
            : `${FDA_SHORTAGE_BASE}${href.replace(/^\.?\//, '')}`
          : `${FDA_SHORTAGE_BASE}default.cfm`;

        const rowStatus = tds.length >= 2 ? $(tds[1]).text().trim() : '';

        records.push({
          drugName,
          status: rowStatus || defaultStatus,
          source: 'FDA',
          url,
        });
      });
  });

  return records;
}
