import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { WarningLetter } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

export function parseWarningLettersHtml(): WarningLetter[] {
  const filePath = path.join(ARTIFACTS_DIR, 'fda_warning_letters_page.html');
  if (!fs.existsSync(filePath)) {
    throw new Error('Warning letters HTML artifact not found');
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);
  const records: WarningLetter[] = [];

  // FDA warning letters page uses table#datatable
  $('table#datatable tbody tr, table tbody tr').each((_i, row) => {
    const tds = $(row).find('td');
    if (tds.length >= 4) {
      const company = $(tds[0]).text().trim();
      const subject = $(tds[1]).text().trim();
      const issueDate = $(tds[2]).text().trim();
      const postedDate = $(tds[3]).text().trim();
      const url = $(tds[0]).find('a').attr('href') ?? '';

      if (company) {
        records.push({
          company,
          subject,
          issueDate,
          postedDate,
          issuingOffice: '',
          letterId: '',
          url: url.startsWith('http') ? url : `https://www.fda.gov${url}`,
        });
      }
    }
  });

  return records;
}
