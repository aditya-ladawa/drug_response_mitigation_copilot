import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { Establishment } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

/**
 * The FDA `drls_reg.txt` bundles street, city, postal, and country into a
 * single comma-delimited ADDRESS field, e.g.
 *   "Rue Grands Navoirs, Chauny, F-02300, France (FRA)"
 *   "123 Main St, San Diego, CA 92101, United States (USA)"
 *
 * This helper splits it. Heuristic-but-defensive: if a part doesn't fit the
 * expected shape, we leave the corresponding field blank rather than guess.
 */
function parseAddress(raw: string): {
  street: string;
  city: string;
  state: string;
  country: string;
} {
  const empty = { street: '', city: '', state: '', country: '' };
  if (!raw) return empty;

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return empty;

  // Last part: "Country" or "Country (CODE)"
  const countryRaw = parts[parts.length - 1];
  const countryMatch = countryRaw.match(/^(.+?)(?:\s*\([A-Z]{2,3}\))?$/);
  const country = (countryMatch?.[1] ?? countryRaw).trim();

  // State: "(XX)" 2-letter code inside any non-last part.
  // US format: "North Carolina (NC) 28112" — the (NC) is what we want.
  // (Last part excluded since country's (USA)/(FRA) would false-match.)
  let state = '';
  for (let i = 0; i < parts.length - 1; i++) {
    const m = parts[i].match(/\(([A-Z]{2})\)/);
    if (m) {
      state = m[1];
      break;
    }
  }

  // City is typically third-to-last (works for both US "street,city,state+zip,country"
  // and foreign "street,city,postal,country" layouts).
  const city = parts.length >= 3 ? parts[parts.length - 3] : parts[0];

  // Everything before the city is the street address.
  const street = parts.length >= 4 ? parts.slice(0, parts.length - 3).join(', ') : '';

  return { street, city, state, country };
}

interface RawEstablishmentRow {
  FEI_NUMBER?: string;
  DUNS_NUMBER?: string;
  FIRM_NAME?: string;
  ADDRESS?: string;
  EXPIRATION_DATE?: string;
  OPERATIONS?: string;
  REGISTRANT_NAME?: string;
  [key: string]: string | undefined;
}

export function parseEstablishments(): Establishment[] {
  const filePath = path.join(ARTIFACTS_DIR, 'fda_drug_establishments.zip');
  if (!fs.existsSync(filePath)) {
    throw new Error('Establishments artifact not found');
  }

  const zip = new AdmZip(filePath);
  // Prefer .txt (TSV) over .xls — cleaner to parse
  const entry =
    zip.getEntries().find((e: AdmZip.IZipEntry) => e.entryName.toLowerCase().endsWith('.txt')) ??
    zip.getEntries().find((e: AdmZip.IZipEntry) => /\.tsv$/i.test(e.entryName));
  if (!entry) {
    throw new Error('No TSV/TXT file found in establishments ZIP');
  }

  const content = zip.readAsText(entry);
  const records: RawEstablishmentRow[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '\t',
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });

  const out: Establishment[] = [];
  for (const r of records) {
    const name = (r.FIRM_NAME ?? '').trim();
    if (!name) continue;

    const { city, state, country } = parseAddress(r.ADDRESS ?? '');

    out.push({
      feiNumber: (r.FEI_NUMBER ?? '').trim(),
      name,
      address: (r.ADDRESS ?? '').trim(),
      city,
      state,
      country: country || 'Unknown',
      operations: (r.OPERATIONS ?? '').trim(),
    });
  }

  return out;
}
