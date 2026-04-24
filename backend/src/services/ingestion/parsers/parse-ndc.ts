import * as fs from 'fs';
import * as path from 'path';
import { NDCRecord } from '../../../types';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../artifacts');

interface OpenFdaNdcResult {
  product_ndc: string;
  generic_name: string;
  brand_name: string;
  labeler_name: string;
  dosage_form: string;
  route: string[];
  active_ingredients: Array<{ name: string; strength: string }>;
  pharm_class: string[];
  marketing_start_date: string;
  product_type: string;
  packaging: Array<{ package_ndc: string; description: string }>;
}

interface NdcJson {
  results?: OpenFdaNdcResult[];
}

export function parseNdc(): NDCRecord[] {
  const filePath = path.join(ARTIFACTS_DIR, 'openfda_ndc.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('NDC artifact not found');
  }

  const data: NdcJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const results = data.results ?? [];

  return results.map((r) => ({
    productNdc: r.product_ndc ?? '',
    genericName: r.generic_name ?? '',
    brandName: r.brand_name ?? '',
    labelerName: r.labeler_name ?? '',
    dosageForm: r.dosage_form ?? '',
    route: r.route ?? [],
    activeIngredients: r.active_ingredients ?? [],
    pharmClass: r.pharm_class ?? [],
    marketingStartDate: r.marketing_start_date ?? '',
    productType: r.product_type ?? '',
    packaging: (r.packaging ?? []).map((p: { package_ndc?: string; description?: string }) => ({
      packageNdc: p.package_ndc ?? '',
      description: p.description ?? '',
    })),
  }));
}
