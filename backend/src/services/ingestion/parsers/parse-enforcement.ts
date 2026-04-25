import * as fs from 'fs';
import * as path from 'path';
import { RecallEvent } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

interface OpenFdaEnforcementResult {
  recall_number: string;
  product_description: string;
  reason_for_recall: string;
  classification: string;
  recalling_firm: string;
  recall_initiation_date: string;
  status: string;
  city: string;
  state: string;
  country: string;
  code_info: string;
}

interface EnforcementJson {
  results?: OpenFdaEnforcementResult[];
}

export function parseEnforcement(): RecallEvent[] {
  const filePath = path.join(ARTIFACTS_DIR, 'openfda_drug_enforcement.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Enforcement artifact not found');
  }

  const data: EnforcementJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const results = data.results ?? [];

  return results.map((r) => ({
    recallNumber: r.recall_number ?? '',
    product: r.product_description ?? '',
    reason: r.reason_for_recall ?? '',
    classification: r.classification ?? '',
    recallingFirm: r.recalling_firm ?? '',
    recallDate: r.recall_initiation_date ?? '',
    status: r.status ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
    country: r.country ?? '',
    codeInfo: r.code_info ?? '',
  }));
}
