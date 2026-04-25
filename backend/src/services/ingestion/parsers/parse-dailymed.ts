import * as fs from 'fs';
import * as path from 'path';
import { SPLLabel } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

interface DailyMedData {
  data?: Array<{ spl_version: number; published_date: string; title: string; setid: string }>;
}

/**
 * DailyMed titles encode the labeler (manufacturer/distributor) in a trailing
 * "[LABELER]" bracket, e.g.
 *   "CIPROFLOXACIN (CIPROFLOXACIN HYDROCHLORIDE) TABLET, FILM COATED [NCS HEALTHCARE]"
 * We extract that so `manufacturer → SPL label` links become possible later.
 */
function extractLabeler(title: string): string {
  const match = title.match(/\[([^\]]+)\]\s*$/);
  return match ? match[1].trim() : '';
}

export function parseDailyMed(): SPLLabel[] {
  const filePath = path.join(ARTIFACTS_DIR, 'dailymed_spls.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('DailyMed artifact not found');
  }

  const data: DailyMedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const results = data.data ?? [];

  return results.map((r) => ({
    setId: r.setid ?? '',
    title: r.title ?? '',
    publishedDate: r.published_date ?? '',
    splVersion: r.spl_version ?? 1,
    labeler: extractLabeler(r.title ?? ''),
  }));
}
