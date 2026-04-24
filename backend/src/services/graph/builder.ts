import Graph from 'graphology';
import { db } from '../../db';
import {
  drugs,
  ndcs,
  manufacturers,
  establishments,
  shortageRecords,
  recallEvents,
  warningLetters,
  importAlerts,
} from '../../db/schema';
import { normalizeDrugName, normalizeManufacturerName } from '../ingestion/entity-resolver';

// ─────────────────────────────────────────────────────────────────────────────
// Node + edge type constants (keep UI and agents aligned)
// ─────────────────────────────────────────────────────────────────────────────

export const NODE_TYPES = {
  DRUG: 'drug',
  NDC: 'ndc',
  MANUFACTURER: 'manufacturer',
  ESTABLISHMENT: 'establishment',
  INGREDIENT: 'ingredient',
  SHORTAGE: 'shortage',
  RECALL: 'recall',
  WARNING_LETTER: 'warning_letter',
  IMPORT_ALERT: 'import_alert',
} as const;

export const EDGE_TYPES = {
  HAS_NDC: 'has_ndc',
  LABELED_BY: 'labeled_by',
  CONTAINS: 'contains',
  OPERATES: 'operates',
  IN_SHORTAGE: 'in_shortage',
  RECALLED_AS: 'recalled_as',
  ISSUED_RECALL: 'issued_recall',
  RECEIVED: 'received',
  SUBJECT_OF: 'subject_of',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Node ID helpers — typed prefixes avoid cross-type collisions
// ─────────────────────────────────────────────────────────────────────────────

export const nodeId = {
  drug: (id: number): string => `drug:${id}`,
  ndc: (code: string): string => `ndc:${code}`,
  manufacturer: (id: number): string => `mfr:${id}`,
  establishment: (id: number): string => `est:${id}`,
  ingredient: (normalizedName: string): string => `ing:${normalizedName}`,
  shortage: (id: number): string => `shortage:${id}`,
  recall: (id: number): string => `recall:${id}`,
  warning: (id: number): string => `warning:${id}`,
  importAlert: (id: number): string => `import:${id}`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Graph construction
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphStats {
  nodes: number;
  edges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  buildMs: number;
}

export function buildGraph(): { graph: Graph; stats: GraphStats } {
  const start = Date.now();
  const g = new Graph({ type: 'directed', multi: false, allowSelfLoops: false });

  // 1. Drugs + ingredient nodes + drug→contains→ingredient edges.
  //    For drugs without explicit activeIngredients (mostly shortage-origin
  //    entries like "Atropine Sulfate Injection"), fall back to inferring
  //    the primary ingredient from the first 1-2 significant words of the
  //    generic name. This stitches shortage drugs into the wider graph.
  const drugRows = db.select().from(drugs).all();
  const drugIdToKey = new Map<number, string>();

  const DOSAGE_FORM_WORDS = new Set([
    'injection', 'tablet', 'tablets', 'capsule', 'capsules', 'solution',
    'suspension', 'oral', 'topical', 'inhalation', 'nasal', 'ophthalmic',
    'cream', 'ointment', 'gel', 'syrup', 'powder', 'patch', 'spray',
    'extended', 'release', 'immediate', 'sustained',
  ]);

  function inferIngredientFromName(name: string): string | null {
    const words = normalizeDrugName(name).split(' ').filter((w) => w.length > 2);
    const primary = words.find((w) => !DOSAGE_FORM_WORDS.has(w));
    return primary ?? null;
  }

  for (const d of drugRows) {
    const key = nodeId.drug(d.id);
    g.addNode(key, {
      type: NODE_TYPES.DRUG,
      label: d.genericName,
      genericName: d.genericName,
      brandNames: d.brandNames ?? [],
      therapeuticClass: d.therapeuticClass ?? null,
    });
    drugIdToKey.set(d.id, key);

    const ingredientNames: string[] = [];
    for (const ing of d.activeIngredients ?? []) {
      const ingName = (ing?.name ?? '').trim();
      if (ingName) ingredientNames.push(ingName);
    }
    // Heuristic fallback when source data has no explicit ingredients
    if (ingredientNames.length === 0) {
      const inferred = inferIngredientFromName(d.genericName);
      if (inferred) ingredientNames.push(inferred);
    }

    for (const ingName of ingredientNames) {
      const ingKey = nodeId.ingredient(normalizeDrugName(ingName));
      if (!g.hasNode(ingKey)) {
        g.addNode(ingKey, { type: NODE_TYPES.INGREDIENT, label: ingName, name: ingName });
      }
      const edgeKey = `${key}->contains->${ingKey}`;
      if (!g.hasEdge(edgeKey)) {
        g.addDirectedEdgeWithKey(edgeKey, key, ingKey, { type: EDGE_TYPES.CONTAINS });
      }
    }
  }

  // 2. Manufacturers
  const mfrRows = db.select().from(manufacturers).all();
  const mfrIdToKey = new Map<number, string>();
  const mfrNormalizedToKey = new Map<string, string>();

  for (const m of mfrRows) {
    const key = nodeId.manufacturer(m.id);
    g.addNode(key, {
      type: NODE_TYPES.MANUFACTURER,
      label: m.name,
      name: m.name,
      normalizedName: m.normalizedName,
    });
    mfrIdToKey.set(m.id, key);
    mfrNormalizedToKey.set(m.normalizedName, key);
  }

  // 3. NDCs — drug→has_ndc→ndc, ndc→labeled_by→manufacturer
  const ndcRows = db.select().from(ndcs).all();

  for (const n of ndcRows) {
    if (!n.ndcCode) continue;
    const key = nodeId.ndc(n.ndcCode);
    if (!g.hasNode(key)) {
      g.addNode(key, {
        type: NODE_TYPES.NDC,
        label: n.ndcCode,
        ndcCode: n.ndcCode,
        dosageForm: n.dosageForm ?? null,
        route: n.route ?? [],
      });
    }

    if (n.drugId) {
      const drugKey = drugIdToKey.get(n.drugId);
      if (drugKey) {
        const edgeKey = `${drugKey}->has_ndc->${key}`;
        if (!g.hasEdge(edgeKey)) {
          g.addDirectedEdgeWithKey(edgeKey, drugKey, key, { type: EDGE_TYPES.HAS_NDC });
        }
      }
    }

    if (n.labeler) {
      const mfrKey = mfrNormalizedToKey.get(normalizeManufacturerName(n.labeler));
      if (mfrKey) {
        const edgeKey = `${key}->labeled_by->${mfrKey}`;
        if (!g.hasEdge(edgeKey)) {
          g.addDirectedEdgeWithKey(edgeKey, key, mfrKey, { type: EDGE_TYPES.LABELED_BY });
        }
      }
    }
  }

  // 4. Establishments — manufacturer→operates→establishment
  const estRows = db.select().from(establishments).all();
  for (const e of estRows) {
    const key = nodeId.establishment(e.id);
    g.addNode(key, {
      type: NODE_TYPES.ESTABLISHMENT,
      label: e.name,
      feiNumber: e.feiNumber ?? null,
      city: e.city ?? null,
      state: e.state ?? null,
      country: e.country ?? null,
      operations: e.operations ?? null,
    });
    if (e.manufacturerId) {
      const mfrKey = mfrIdToKey.get(e.manufacturerId);
      if (mfrKey) {
        const edgeKey = `${mfrKey}->operates->${key}`;
        if (!g.hasEdge(edgeKey)) {
          g.addDirectedEdgeWithKey(edgeKey, mfrKey, key, { type: EDGE_TYPES.OPERATES });
        }
      }
    }
  }

  // 5. Shortages — drug→in_shortage→shortage
  const shortageRows = db.select().from(shortageRecords).all();
  for (const s of shortageRows) {
    const key = nodeId.shortage(s.id);
    g.addNode(key, {
      type: NODE_TYPES.SHORTAGE,
      label: s.drugName,
      status: s.status,
      source: s.source,
      drugName: s.drugName,
    });
    if (s.drugId) {
      const drugKey = drugIdToKey.get(s.drugId);
      if (drugKey) {
        const edgeKey = `${drugKey}->in_shortage->${key}`;
        if (!g.hasEdge(edgeKey)) {
          g.addDirectedEdgeWithKey(edgeKey, drugKey, key, { type: EDGE_TYPES.IN_SHORTAGE });
        }
      }
    }
  }

  // 6. Recalls — drug→recalled_as→recall, manufacturer→issued_recall→recall
  const recallRows = db.select().from(recallEvents).all();
  for (const r of recallRows) {
    const key = nodeId.recall(r.id);
    g.addNode(key, {
      type: NODE_TYPES.RECALL,
      label: r.recallNumber,
      classification: r.classification ?? null,
      recallDate: r.recallDate ?? null,
      status: r.status ?? null,
      product: r.product,
    });
    if (r.drugId) {
      const drugKey = drugIdToKey.get(r.drugId);
      if (drugKey) {
        const edgeKey = `${drugKey}->recalled_as->${key}`;
        if (!g.hasEdge(edgeKey)) {
          g.addDirectedEdgeWithKey(edgeKey, drugKey, key, { type: EDGE_TYPES.RECALLED_AS });
        }
      }
    }
    if (r.manufacturerId) {
      const mfrKey = mfrIdToKey.get(r.manufacturerId);
      if (mfrKey) {
        const edgeKey = `${mfrKey}->issued_recall->${key}`;
        if (!g.hasEdge(edgeKey)) {
          g.addDirectedEdgeWithKey(edgeKey, mfrKey, key, { type: EDGE_TYPES.ISSUED_RECALL });
        }
      }
    }
  }

  // 7. Warning letters — manufacturer→received→warning
  const warningRows = db.select().from(warningLetters).all();
  for (const w of warningRows) {
    const key = nodeId.warning(w.id);
    g.addNode(key, {
      type: NODE_TYPES.WARNING_LETTER,
      label: w.subject ?? w.company,
      company: w.company,
      subject: w.subject ?? null,
      issueDate: w.issueDate ?? null,
      url: w.url ?? null,
    });
    if (w.manufacturerId) {
      const mfrKey = mfrIdToKey.get(w.manufacturerId);
      if (mfrKey) {
        const edgeKey = `${mfrKey}->received->${key}`;
        if (!g.hasEdge(edgeKey)) {
          g.addDirectedEdgeWithKey(edgeKey, mfrKey, key, { type: EDGE_TYPES.RECEIVED });
        }
      }
    }
  }

  // 8. Import alerts — manufacturer→subject_of→import_alert
  const importRows = db.select().from(importAlerts).all();
  for (const ia of importRows) {
    const key = nodeId.importAlert(ia.id);
    g.addNode(key, {
      type: NODE_TYPES.IMPORT_ALERT,
      label: ia.alertNumber,
      alertNumber: ia.alertNumber,
      charge: ia.charge ?? null,
      country: ia.country ?? null,
    });
    if (ia.manufacturerId) {
      const mfrKey = mfrIdToKey.get(ia.manufacturerId);
      if (mfrKey) {
        const edgeKey = `${mfrKey}->subject_of->${key}`;
        if (!g.hasEdge(edgeKey)) {
          g.addDirectedEdgeWithKey(edgeKey, mfrKey, key, { type: EDGE_TYPES.SUBJECT_OF });
        }
      }
    }
  }

  return { graph: g, stats: computeStats(g, Date.now() - start) };
}

function computeStats(g: Graph, buildMs: number): GraphStats {
  const nodesByType: Record<string, number> = {};
  const edgesByType: Record<string, number> = {};

  g.forEachNode((_n, attrs) => {
    const t = (attrs.type as string) ?? 'unknown';
    nodesByType[t] = (nodesByType[t] ?? 0) + 1;
  });
  g.forEachEdge((_e, attrs) => {
    const t = (attrs.type as string) ?? 'unknown';
    edgesByType[t] = (edgesByType[t] ?? 0) + 1;
  });

  return { nodes: g.order, edges: g.size, nodesByType, edgesByType, buildMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton — persists across ts-node-dev hot reloads via globalThis
// ─────────────────────────────────────────────────────────────────────────────

type GraphCache = { graph?: Graph; stats?: GraphStats };
const globalCache = globalThis as unknown as { __drugGraph?: GraphCache };
if (!globalCache.__drugGraph) globalCache.__drugGraph = {};

export function getGraph(): Graph {
  const cache = globalCache.__drugGraph!;
  if (!cache.graph) {
    const { graph, stats } = buildGraph();
    cache.graph = graph;
    cache.stats = stats;
    console.log(
      `[Graph] built: ${stats.nodes} nodes, ${stats.edges} edges in ${stats.buildMs}ms`,
    );
  }
  return cache.graph;
}

export function getGraphStats(): GraphStats {
  const cache = globalCache.__drugGraph!;
  if (!cache.stats) getGraph();
  return cache.stats!;
}

export function invalidateGraph(): void {
  const cache = globalCache.__drugGraph!;
  cache.graph = undefined;
  cache.stats = undefined;
  console.log('[Graph] cache invalidated');
}
