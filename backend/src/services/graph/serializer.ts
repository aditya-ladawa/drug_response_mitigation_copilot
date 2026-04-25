import { NODE_TYPES, EDGE_TYPES } from './builder';
import type { Subgraph, GraphNode, GraphLink } from './queries';

// ─────────────────────────────────────────────────────────────────────────────
// Visual encoding — node colors/sizes and edge colors keyed by type.
// Designed for react-force-graph-2d but just plain data; UI can restyle freely.
// ─────────────────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  [NODE_TYPES.DRUG]: '#3498db',
  [NODE_TYPES.NDC]: '#95a5a6',
  [NODE_TYPES.MANUFACTURER]: '#e67e22',
  [NODE_TYPES.ESTABLISHMENT]: '#9b59b6',
  [NODE_TYPES.INGREDIENT]: '#1abc9c',
  [NODE_TYPES.SHORTAGE]: '#e74c3c',
  [NODE_TYPES.RECALL]: '#c0392b',
  [NODE_TYPES.WARNING_LETTER]: '#f39c12',
  [NODE_TYPES.IMPORT_ALERT]: '#d35400',
};

const NODE_SIZES: Record<string, number> = {
  [NODE_TYPES.DRUG]: 10,
  [NODE_TYPES.NDC]: 4,
  [NODE_TYPES.MANUFACTURER]: 12,
  [NODE_TYPES.ESTABLISHMENT]: 7,
  [NODE_TYPES.INGREDIENT]: 6,
  [NODE_TYPES.SHORTAGE]: 14,
  [NODE_TYPES.RECALL]: 9,
  [NODE_TYPES.WARNING_LETTER]: 9,
  [NODE_TYPES.IMPORT_ALERT]: 9,
};

const EDGE_COLORS: Record<string, string> = {
  [EDGE_TYPES.HAS_NDC]: '#bdc3c7',
  [EDGE_TYPES.LABELED_BY]: '#e67e22',
  [EDGE_TYPES.CONTAINS]: '#1abc9c',
  [EDGE_TYPES.OPERATES]: '#9b59b6',
  [EDGE_TYPES.IN_SHORTAGE]: '#e74c3c',
  [EDGE_TYPES.RECALLED_AS]: '#c0392b',
  [EDGE_TYPES.ISSUED_RECALL]: '#c0392b',
  [EDGE_TYPES.RECEIVED]: '#f39c12',
  [EDGE_TYPES.SUBJECT_OF]: '#d35400',
};

export interface SerializedNode {
  id: string;
  type: string;
  label: string;
  color: string;
  val: number;
  // Forward every other attribute the UI might want
  [key: string]: unknown;
}

export interface SerializedLink {
  source: string;
  target: string;
  type: string;
  color: string;
  [key: string]: unknown;
}

export interface SerializedGraph {
  rootId: string | null;
  nodes: SerializedNode[];
  links: SerializedLink[];
  stats: { nodes: number; links: number; byType: Record<string, number> };
}

export function serializeNode(node: GraphNode): SerializedNode {
  const type = node.type;
  return {
    ...node,
    color: NODE_COLORS[type] ?? '#7f8c8d',
    val: NODE_SIZES[type] ?? 5,
  } as SerializedNode;
}

export function serializeLink(link: GraphLink): SerializedLink {
  return {
    ...link,
    color: EDGE_COLORS[link.type] ?? '#bdc3c7',
  } as SerializedLink;
}

export function serialize(subgraph: Subgraph): SerializedGraph {
  const byType: Record<string, number> = {};
  for (const n of subgraph.nodes) {
    byType[n.type] = (byType[n.type] ?? 0) + 1;
  }

  return {
    rootId: subgraph.rootId,
    nodes: subgraph.nodes.map(serializeNode),
    links: subgraph.links.map(serializeLink),
    stats: { nodes: subgraph.nodes.length, links: subgraph.links.length, byType },
  };
}
