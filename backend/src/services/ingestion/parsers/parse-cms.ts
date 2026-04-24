import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

export interface CmsPartDRecord {
  prescriberNpi: string;
  prescriberLastName: string;
  prescriberFirstName: string;
  prescriberCity: string;
  prescriberState: string;
  brandName: string;
  genericName: string;
  totalClaims: string;
  totalDrugCost: string;
}

export function parseCmsPartD(): CmsPartDRecord[] {
  const filePath = path.join(ARTIFACTS_DIR, 'cms_medicare_part_d.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('CMS Part D artifact not found');
  }

  const data: Record<string, unknown>[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  return data.map((r) => ({
    prescriberNpi: String(r['Prscrbr_NPI'] ?? ''),
    prescriberLastName: String(r['Prscrbr_Last_Org_Name'] ?? ''),
    prescriberFirstName: String(r['Prscrbr_First_Name'] ?? ''),
    prescriberCity: String(r['Prscrbr_City'] ?? ''),
    prescriberState: String(r['Prscrbr_State_Abrvtn'] ?? ''),
    brandName: String(r['Brnd_Name'] ?? ''),
    genericName: String(r['Gnrc_Name'] ?? ''),
    totalClaims: String(r['Tot_Clms'] ?? ''),
    totalDrugCost: String(r['Tot_Drug_Cst'] ?? ''),
  }));
}
