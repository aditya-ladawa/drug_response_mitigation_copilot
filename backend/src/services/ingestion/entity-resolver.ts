import Fuse from 'fuse.js';
import { Drug, Manufacturer } from '../../types';

const MANUFACTURER_STOP_WORDS = new Set([
  'inc', 'inc.', 'llc', 'ltd', 'ltd.', 'corp', 'corp.', 'corporation',
  'company', 'co', 'co.', 'pharmaceuticals', 'pharma', 'laboratories',
  'lab', 'labs', 'limited', 'plc', 'gmbh', 'sa', 'bv', 'nv', 'ag',
]);

export function normalizeManufacturerName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !MANUFACTURER_STOP_WORDS.has(w))
    .join(' ')
    .trim();
}

export function normalizeDrugName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let drugFuse: Fuse<Drug> | null = null;

export function buildDrugIndex(drugs: Drug[]): void {
  drugFuse = new Fuse(drugs, {
    keys: ['genericName'],
    threshold: 0.3,
    includeScore: true,
  });
}

export function resolveDrug(query: string): Drug | null {
  if (!drugFuse) return null;
  const results = drugFuse.search(query);
  if (results.length > 0 && results[0].score !== undefined && results[0].score <= 0.3) {
    return results[0].item;
  }
  return null;
}

export function deduplicateDrugs(drugs: Drug[]): Drug[] {
  const seen = new Map<string, Drug>();
  for (const drug of drugs) {
    const key = normalizeDrugName(drug.genericName);
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, {
        genericName: drug.genericName,
        brandNames: drug.brandNames ? [...drug.brandNames] : [],
        activeIngredients: drug.activeIngredients ? [...drug.activeIngredients] : [],
        therapeuticClass: drug.therapeuticClass ?? null,
      });
    } else {
      // Merge: keep existing's primary name, accumulate brands/ingredients
      if (drug.brandNames?.length) {
        const merged = new Set([...(existing.brandNames ?? []), ...drug.brandNames]);
        existing.brandNames = Array.from(merged).filter(Boolean);
      }
      if (drug.activeIngredients?.length && !existing.activeIngredients?.length) {
        existing.activeIngredients = drug.activeIngredients;
      }
      if (drug.therapeuticClass && !existing.therapeuticClass) {
        existing.therapeuticClass = drug.therapeuticClass;
      }
    }
  }
  return Array.from(seen.values());
}

// Dosage-form and route words that are never the drug ingredient.
// Used to skip over these when picking the "first significant word".
const NON_INGREDIENT_WORDS = new Set([
  'injection', 'injectable', 'tablet', 'tablets', 'capsule', 'capsules',
  'solution', 'suspension', 'oral', 'topical', 'inhalation', 'nasal',
  'ophthalmic', 'cream', 'ointment', 'gel', 'syrup', 'powder', 'patch',
  'spray', 'extended', 'release', 'immediate', 'sustained', 'controlled',
  'film', 'coated', 'chewable', 'drops', 'lotion', 'foam', 'liquid',
  'concentrate', 'sterile', 'usp', 'er', 'xr', 'sr', 'mr', 'hcl',
  'sodium', 'potassium', 'sulfate', 'hydrochloride', 'citrate',
  'for', 'and', 'with', 'the', 'of', 'in',
]);

function firstSignificantWord(normalized: string): string | null {
  const words = normalized.split(' ').filter((w) => w.length >= 4 && !NON_INGREDIENT_WORDS.has(w));
  return words[0] ?? null;
}

/**
 * Build a normalized name → drug id map used to resolve FKs during ingestion.
 * Indexed by:
 *   - full normalized generic name      (highest confidence)
 *   - each brand name                   (medium confidence)
 *   - first significant word            (fallback, only set if unclaimed)
 *
 * The first-word tier is critical for linking recall product strings like
 * "Semaglutide Injection, 10 mg/4 mL" to a canonical Semaglutide drug entry.
 */
export function buildDrugNameToIdMap(
  drugs: Array<{ id: number; genericName: string; brandNames?: string[] | null }>,
): Map<string, number> {
  const map = new Map<string, number>();

  // Pass 1: full normalized names + brands (high confidence — don't overwrite)
  for (const d of drugs) {
    const primaryKey = normalizeDrugName(d.genericName);
    if (primaryKey && !map.has(primaryKey)) map.set(primaryKey, d.id);
    for (const brand of d.brandNames ?? []) {
      const brandKey = normalizeDrugName(brand);
      if (brandKey && !map.has(brandKey)) map.set(brandKey, d.id);
    }
  }

  // Pass 2: first-significant-word fallbacks — only fill gaps left by pass 1
  for (const d of drugs) {
    const primaryKey = normalizeDrugName(d.genericName);
    const fw = primaryKey ? firstSignificantWord(primaryKey) : null;
    if (fw && !map.has(fw)) map.set(fw, d.id);
  }

  return map;
}

/**
 * Resolve a drug's id by name with progressive fallback:
 *   exact normalized → first-significant-word → null
 */
export function resolveDrugId(name: string, map: Map<string, number>): number | null {
  if (!name) return null;
  const normalized = normalizeDrugName(name);
  if (!normalized) return null;
  const exact = map.get(normalized);
  if (exact) return exact;
  const fw = firstSignificantWord(normalized);
  return fw ? map.get(fw) ?? null : null;
}

export function buildManufacturerNameToIdMap(
  mfrs: Array<{ id: number; name: string; normalizedName: string }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of mfrs) {
    if (m.normalizedName && !map.has(m.normalizedName)) map.set(m.normalizedName, m.id);
  }
  return map;
}

export function deduplicateManufacturers(manufacturers: Manufacturer[]): Manufacturer[] {
  const seen = new Map<string, Manufacturer>();
  for (const m of manufacturers) {
    const key = m.normalizedName;
    // Filter out degenerate entries: too short to be a real firm name
    if (!key || key.length < 3) continue;
    if (!seen.has(key)) {
      seen.set(key, m);
    }
  }
  return Array.from(seen.values());
}
