import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { OrangeBookEntry } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

export function parseOrangeBook(): OrangeBookEntry[] {
  const filePath = path.join(ARTIFACTS_DIR, 'fda_orange_book.zip');
  if (!fs.existsSync(filePath)) {
    throw new Error('Orange Book artifact not found');
  }

  const zip = new AdmZip(filePath);
  const entry = zip.getEntries().find((e: AdmZip.IZipEntry) => e.entryName.includes('products'));
  if (!entry) {
    throw new Error('No products file found in Orange Book ZIP');
  }

  const content = zip.readAsText(entry);
  const records: Record<string, string>[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '~',
    relax_column_count: true,
  });

  return records.map((r) => ({
    ingredient: r['Ingredient'] ?? r['ingredient'] ?? '',
    tradeName: r['Trade_Name'] ?? r['Trade Name'] ?? r['trade_name'] ?? '',
    applicant: r['Applicant'] ?? r['applicant'] ?? '',
    teCode: r['TE_Code'] ?? r['TE Code'] ?? r['te_code'] ?? '',
    type: r['Type'] ?? r['type'] ?? '',
    rldFlag: r['RLD'] ?? r['rld'] ?? r['rld_flag'] ?? '',
  })).filter((r) => r.ingredient && r.ingredient.length > 0);
}
