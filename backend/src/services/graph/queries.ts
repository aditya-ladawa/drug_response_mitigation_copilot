import Graph from 'graphology';
import { EDGE_TYPES, NODE_TYPES, getGraph, nodeId } from './builder';

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  [key: string]: unknown;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  [key: string]: unknown;
}

export interface Subgraph {
  nodes: GraphNode[];
  links: GraphLink[];
  rootId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building-block helpers
// ─────────────────────────────────────────────────────────────────────────────

function collectNode(g: Graph, id: string): GraphNode {
  return { id, ...(g.getNodeAttributes(id) as Record<string, unknown>) } as GraphNode;
}

function collectEdges(g: Graph, nodeIds: Set<string>): GraphLink[] {
  const out: GraphLink[] = [];
  for (const n of nodeIds) {
    g.forEachOutEdge(n, (_edgeKey, attrs, source, target) => {
      if (nodeIds.has(target)) {
        out.push({ source, target, ...(attrs as Record<string, unknown>) } as GraphLink);
      }
    });
  }
  return out;
}

/**
 * BFS from a root node up to `depth`, following both in- and out-edges.
 * Returns the induced subgraph (nodes + only edges between visited nodes).
 */
export function getSubgraph(rootId: string, depth = 2): Subgraph {
  const g = getGraph();
  if (!g.hasNode(rootId)) return { nodes: [], links: [], rootId: null };

  const visited = new Set<string>([rootId]);
  let frontier = new Set<string>([rootId]);

  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const node of frontier) {
      g.forEachNeighbor(node, (neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.add(neighbor);
        }
      });
    }
    if (next.size === 0) break;
    frontier = next;
  }

  const nodes = Array.from(visited).map((id) => collectNode(g, id));
  const links = collectEdges(g, visited);
  return { nodes, links, rootId };
}

/** Neighbors of a node, optionally filtered by edge type and/or neighbor node type. */
export function getNeighbors(
  id: string,
  opts: { edgeType?: string; nodeType?: string; direction?: 'in' | 'out' | 'both' } = {},
): GraphNode[] {
  const g = getGraph();
  if (!g.hasNode(id)) return [];
  const direction = opts.direction ?? 'both';
  const result: GraphNode[] = [];

  const visit = (edgeKey: string, attrs: Record<string, unknown>, _s: string, target: string): void => {
    if (opts.edgeType && attrs.type !== opts.edgeType) return;
    const nAttrs = g.getNodeAttributes(target) as Record<string, unknown>;
    if (opts.nodeType && nAttrs.type !== opts.nodeType) return;
    result.push({ id: target, ...nAttrs } as GraphNode);
  };

  if (direction === 'out' || direction === 'both') g.forEachOutEdge(id, visit);
  if (direction === 'in' || direction === 'both') {
    g.forEachInEdge(id, (ek, attrs, source) => visit(ek, attrs, id, source));
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level domain queries — used as building blocks by agent tools later
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supply chain subgraph for a drug:
 * drug → ingredients, drug → NDCs → manufacturers → establishments,
 * plus manufacturers' regulatory baggage (warnings, import alerts) and
 * recent recalls. Depth 3 is enough to pull the whole chain.
 */
export function getSupplyChainGraph(drugDbId: number, depth = 3): Subgraph {
  return getSubgraph(nodeId.drug(drugDbId), depth);
}

/**
 * What's at risk if this manufacturer fails?
 * Walk mfr → (its NDCs, drugs, establishments, warnings, imports, recalls).
 */
export function getRiskCluster(manufacturerDbId: number): {
  mfr: GraphNode | null;
  drugs: GraphNode[];
  establishments: GraphNode[];
  warnings: GraphNode[];
  importAlerts: GraphNode[];
  recalls: GraphNode[];
} {
  const g = getGraph();
  const mfrKey = nodeId.manufacturer(manufacturerDbId);
  if (!g.hasNode(mfrKey)) {
    return { mfr: null, drugs: [], establishments: [], warnings: [], importAlerts: [], recalls: [] };
  }

  const establishments_ = getNeighbors(mfrKey, {
    edgeType: EDGE_TYPES.OPERATES,
    direction: 'out',
  });
  const warnings = getNeighbors(mfrKey, { edgeType: EDGE_TYPES.RECEIVED, direction: 'out' });
  const importAlertsOut = getNeighbors(mfrKey, {
    edgeType: EDGE_TYPES.SUBJECT_OF,
    direction: 'out',
  });
  const recalls = getNeighbors(mfrKey, { edgeType: EDGE_TYPES.ISSUED_RECALL, direction: 'out' });

  // Drugs reach mfr via: drug → has_ndc → ndc → labeled_by → mfr (2 hops reversed)
  const ndcNodes = getNeighbors(mfrKey, { edgeType: EDGE_TYPES.LABELED_BY, direction: 'in' });
  const drugSet = new Map<string, GraphNode>();
  for (const ndc of ndcNodes) {
    const drugsFromNdc = getNeighbors(ndc.id, { edgeType: EDGE_TYPES.HAS_NDC, direction: 'in' });
    for (const d of drugsFromNdc) drugSet.set(d.id, d);
  }

  return {
    mfr: collectNode(g, mfrKey),
    drugs: Array.from(drugSet.values()),
    establishments: establishments_,
    warnings,
    importAlerts: importAlertsOut,
    recalls,
  };
}

/**
 * Other drugs sharing an ingredient with this drug — the "same upstream" set.
 */
export function getDrugsSharingIngredient(drugDbId: number): GraphNode[] {
  const g = getGraph();
  const drugKey = nodeId.drug(drugDbId);
  if (!g.hasNode(drugKey)) return [];

  const ingredients = getNeighbors(drugKey, {
    edgeType: EDGE_TYPES.CONTAINS,
    direction: 'out',
  });

  const siblings = new Map<string, GraphNode>();
  for (const ing of ingredients) {
    const others = getNeighbors(ing.id, { edgeType: EDGE_TYPES.CONTAINS, direction: 'in' });
    for (const d of others) {
      if (d.id !== drugKey) siblings.set(d.id, d);
    }
  }
  return Array.from(siblings.values());
}

/**
 * Drug lookup by (normalized) generic name → node. Linear scan, but only called
 * on user-initiated requests (not hot path).
 */
export function findDrugByName(name: string): GraphNode | null {
  const g = getGraph();
  const query = name.toLowerCase().trim();
  let hit: GraphNode | null = null;
  g.forEachNode((id, attrs) => {
    if (hit) return;
    if (attrs.type !== NODE_TYPES.DRUG) return;
    const gn = (attrs.genericName as string | undefined)?.toLowerCase() ?? '';
    if (gn === query || gn.startsWith(query)) {
      hit = { id, ...(attrs as Record<string, unknown>) } as GraphNode;
    }
  });
  return hit;
}

export function findManufacturerByName(name: string): GraphNode | null {
  const g = getGraph();
  const query = name.toLowerCase().trim();
  let hit: GraphNode | null = null;
  g.forEachNode((id, attrs) => {
    if (hit) return;
    if (attrs.type !== NODE_TYPES.MANUFACTURER) return;
    const n = (attrs.name as string | undefined)?.toLowerCase() ?? '';
    if (n === query || n.includes(query)) {
      hit = { id, ...(attrs as Record<string, unknown>) } as GraphNode;
    }
  });
  return hit;
}
