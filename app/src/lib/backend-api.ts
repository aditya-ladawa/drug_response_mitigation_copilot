import type { AgentEvent, CopilotGraph, CopilotLink, CopilotNode, GraphNodeType } from "@/types/copilot";

export const API_BASE_URL =
  process.env.BACKEND_API_URL?.replace(/\/+$/, "") ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:3001";

export type BackendNode = {
  id: string;
  type: string;
  label?: string;
  name?: string;
  genericName?: string;
  drugName?: string;
  company?: string;
  subject?: string;
  product?: string;
  status?: string;
  source?: string;
  city?: string;
  state?: string;
  country?: string;
  color?: string;
  val?: number;
  confidence?: number;
  [key: string]: unknown;
};

export type BackendLink = {
  source: string;
  target: string;
  type?: string;
  color?: string;
  [key: string]: unknown;
};

export type BackendGraph = {
  rootId?: string | null;
  nodes?: BackendNode[];
  links?: BackendLink[];
  stats?: { nodes: number; links: number; byType?: Record<string, number> };
};

type ShortageRecord = {
  drugName: string;
  status: string;
  source: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type RefreshStatus = {
  running: boolean;
  lastRefresh: {
    status: string;
    startedAt: string;
    completedAt: string | null;
    sourcesOk: number;
    sourcesFailed: number;
  } | null;
};

const typeColors: Record<string, string> = {
  drug: "#ffffff",
  manufacturer: "#67e8f9",
  plant: "#f97316",
  ndc: "#94a3b8",
  recall: "#fb7185",
  warning: "#facc15",
  shortage: "#a78bfa",
  ingredient: "#34d399",
  import_alert: "#fb923c",
};

const locationHints: Record<string, { lat: number; lng: number }> = {
  "united states": { lat: 39.8283, lng: -98.5795 },
  usa: { lat: 39.8283, lng: -98.5795 },
  us: { lat: 39.8283, lng: -98.5795 },
  india: { lat: 20.5937, lng: 78.9629 },
  germany: { lat: 51.1657, lng: 10.4515 },
  switzerland: { lat: 46.8182, lng: 8.2275 },
  china: { lat: 35.8617, lng: 104.1954 },
  ireland: { lat: 53.4129, lng: -8.2439 },
  italy: { lat: 41.8719, lng: 12.5674 },
  france: { lat: 46.2276, lng: 2.2137 },
  canada: { lat: 56.1304, lng: -106.3468 },
  mexico: { lat: 23.6345, lng: -102.5528 },
  cincinnati: { lat: 39.1031, lng: -84.512 },
  phoenix: { lat: 33.4484, lng: -112.074 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  basel: { lat: 47.5596, lng: 7.5886 },
  "new jersey": { lat: 40.0583, lng: -74.4057 },
  california: { lat: 36.7783, lng: -119.4179 },
  "north carolina": { lat: 35.7596, lng: -79.0193 },
  ohio: { lat: 40.4173, lng: -82.9071 },
};

function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window !== "undefined") {
    return normalizedPath === "/health" ? "/api/health" : normalizedPath;
  }

  return `${API_BASE_URL}${normalizedPath}`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Backend request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function normalizeNodeType(type: string): GraphNodeType {
  if (type === "establishment") return "plant";
  if (type === "warning_letter") return "warning";
  if (type === "import_alert") return "import_alert";
  if (type === "ndc") return "ndc";
  if (type === "manufacturer") return "manufacturer";
  if (type === "recall") return "recall";
  if (type === "shortage") return "shortage";
  if (type === "ingredient") return "ingredient";
  return "drug";
}

function displayName(node: BackendNode): string {
  return (
    node.name ??
    node.label ??
    node.genericName ??
    node.drugName ??
    node.company ??
    node.subject ??
    node.product ??
    node.id
  );
}

function riskForNode(type: GraphNodeType, index: number): CopilotNode["risk"] {
  if (type === "plant") return index === 0 ? "high" : "medium";
  if (type === "shortage" || type === "recall" || type === "warning" || type === "import_alert") return "high";
  return "low";
}

function coordsForNode(node: BackendNode, index: number): { lat: number; lng: number } | null {
  const text = [node.city, node.state, node.country, node.label, node.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const [key, coords] of Object.entries(locationHints)) {
    if (text.includes(key)) {
      return {
        lat: coords.lat + (index % 3) * 0.9,
        lng: coords.lng + (index % 4) * 1.2,
      };
    }
  }

  if (node.type !== "establishment") return null;
  return {
    lat: 35 + (index % 5) * 4,
    lng: -100 + (index % 7) * 18,
  };
}

function descriptionForNode(node: BackendNode, type: GraphNodeType): string {
  if (type === "plant") {
    return [node.city, node.state, node.country].filter(Boolean).join(", ") || "Manufacturing establishment";
  }
  if (type === "shortage") return `${node.status ?? "Shortage"} signal from ${node.source ?? "source data"}.`;
  if (type === "warning") return String(node.subject ?? "Regulatory warning signal.");
  if (type === "recall") return String(node.product ?? "Recall event connected to this supply graph.");
  if (type === "ndc") return "NDC package/product node connected to labeler and drug.";
  return String(node.genericName ?? node.label ?? node.name ?? "");
}

function linkLabel(type?: string) {
  return (type ?? "related").replace(/_/g, " ");
}

function prioritizeNodes(raw: BackendGraph, maxNodes = 95): BackendNode[] {
  const nodes = raw.nodes ?? [];
  if (nodes.length <= maxNodes) return nodes;

  const rootId = raw.rootId;
  const rank = (node: BackendNode) => {
    if (node.id === rootId) return 0;
    if (node.type === "shortage") return 1;
    if (node.type === "establishment") return 2;
    if (node.type === "manufacturer") return 3;
    if (node.type === "warning_letter" || node.type === "import_alert" || node.type === "recall") return 4;
    if (node.type === "ingredient") return 5;
    if (node.type === "drug") return 6;
    if (node.type === "ndc") return 7;
    return 8;
  };

  return [...nodes]
    .sort((a, b) => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b)))
    .slice(0, maxNodes);
}

export function adaptBackendGraph(raw: BackendGraph, drug: string): CopilotGraph {
  const nodes = prioritizeNodes(raw);
  const keptIds = new Set(nodes.map((node) => node.id));
  const plantNodes = nodes.filter((node) => node.type === "establishment");
  let plantIndex = 0;

  const adaptedNodes: CopilotNode[] = nodes.map((node) => {
    const type = normalizeNodeType(node.type);
    const coords = type === "plant" ? coordsForNode(node, plantIndex++) : null;
    const risk = riskForNode(type, type === "plant" ? plantIndex - 1 : 0);

    return {
      id: node.id,
      name: displayName(node),
      type,
      val: typeof node.val === "number" ? node.val : undefined,
      color: typeColors[type] ?? node.color ?? "#ffffff",
      lat: coords?.lat,
      lng: coords?.lng,
      risk,
      description: descriptionForNode(node, type),
      impact: type === "plant" ? "Manufacturing site connected to the queried drug supply graph." : undefined,
      confidence: risk === "high" ? 0.82 : 0.68,
      evidence: [
        `Backend node type: ${node.type}`,
        raw.rootId === node.id ? "Root entity for this investigation graph." : "Connected through backend graph traversal.",
      ],
    };
  });

  const shortageCount = adaptedNodes.filter((node) => node.type === "shortage").length;
  const regulatoryCount = adaptedNodes.filter((node) =>
    ["warning", "recall", "import_alert"].includes(node.type),
  ).length;
  const riskScore = Math.min(96, Math.max(42, 52 + shortageCount * 9 + regulatoryCount * 6 + plantNodes.length * 2));
  const affectedSupply = Math.min(88, Math.max(18, 34 + shortageCount * 12 + plantNodes.length * 4));
  const primaryPlant = adaptedNodes.find((node) => node.type === "plant" && node.risk === "high")?.name;

  const links: CopilotLink[] = (raw.links ?? [])
    .filter((link) => keptIds.has(link.source) && keptIds.has(link.target))
    .slice(0, 140)
    .map((link) => ({
      source: link.source,
      target: link.target,
      label: linkLabel(link.type),
      color: link.color,
      strength: 0.8,
    }));

  return {
    drug,
    summary:
      adaptedNodes.length > 0
        ? `Backend graph returned ${raw.nodes?.length ?? adaptedNodes.length} entities; showing the ${adaptedNodes.length} most relevant nodes for ${drug}.`
        : `No backend graph entities were found for ${drug}.`,
    metrics: {
      riskLevel: riskScore >= 75 ? "high" : riskScore >= 55 ? "medium" : "low",
      riskScore,
      affectedSupply,
      confidence: Math.min(0.92, 0.58 + adaptedNodes.length * 0.012),
      primaryPlant: primaryPlant ?? "No plant resolved",
      eta: regulatoryCount > 0 ? "7-14 days" : "monitor",
      substitutes: adaptedNodes.filter((node) => node.type === "ingredient" || node.type === "ndc").length,
    },
    recommendations: [
      "Review shortage status and affected products from backend records.",
      "Use connected manufacturers and establishments to prioritize outreach.",
      "Monitor recall, warning letter, and import alert nodes for quality signals.",
    ],
    nodes: adaptedNodes,
    links,
  };
}

export async function getHealth(): Promise<{ status: string }> {
  return fetchJson<{ status: string }>("/health");
}

export async function getRefreshStatus(): Promise<RefreshStatus> {
  return fetchJson<RefreshStatus>("/api/refresh/status");
}

export async function getShortages(): Promise<{ count: number; records: ShortageRecord[] }> {
  return fetchJson<{ count: number; records: ShortageRecord[] }>("/api/shortages");
}

export async function getDrugGraph(drug: string): Promise<CopilotGraph> {
  const raw = await fetchJson<BackendGraph>(`/api/graph/drug/${encodeURIComponent(drug)}?depth=3`);
  return adaptBackendGraph(raw, drug);
}

export function createAgentEvent(
  partial: Omit<AgentEvent, "id" | "timestamp"> & { id?: string; timestamp?: string },
): AgentEvent {
  return {
    id: partial.id ?? `${partial.tool}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    ...partial,
  };
}

export function agentEventFromSse(eventName: string, payload: Record<string, unknown>, drug: string): AgentEvent | null {
  if (eventName === "start") {
    return createAgentEvent({
      agent: "Orchestrator",
      tool: "startInvestigation",
      message: `Backend investigation started for ${String(payload.drug ?? drug)}.`,
      status: "running",
      confidence: 0.72,
      source: "Express backend",
    });
  }

  if (eventName === "tool_call") {
    const name = String(payload.name ?? "backendTool");
    return createAgentEvent({
      agent: "Backend Agent",
      tool: name,
      message: `Calling ${name}.`,
      status: "running",
      confidence: 0.7,
      source: "SSE tool call",
    });
  }

  if (eventName === "tool_result") {
    const name = String(payload.name ?? "backendTool");
    return createAgentEvent({
      agent: "Backend Agent",
      tool: name,
      message: String(payload.preview ?? `${name} completed.`),
      status: "complete",
      confidence: 0.78,
      source: "SSE tool result",
    });
  }

  if (eventName === "graph_data") {
    return createAgentEvent({
      agent: "Graph Builder",
      tool: "getSupplyChainGraph",
      message: "Knowledge graph updated from backend supply-chain data.",
      status: "complete",
      confidence: 0.82,
      source: "Backend graph payload",
    });
  }

  if (eventName === "subagent") {
    const name = String(payload.name ?? "subagent");
    const status = payload.status === "done" ? "complete" : "running";
    return createAgentEvent({
      agent: name.replace(/_/g, " "),
      tool: "subagent",
      message: `${name.replace(/_/g, " ")} ${status === "complete" ? "completed" : "started"}.`,
      status,
      confidence: 0.76,
      source: "Backend agent",
    });
  }

  if (eventName === "done") {
    return createAgentEvent({
      agent: "Orchestrator",
      tool: "finalizeBrief",
      message: "Backend investigation stream completed.",
      status: "complete",
      confidence: 0.8,
      source: "Express backend",
      durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
    });
  }

  if (eventName === "error") {
    return createAgentEvent({
      agent: "Backend",
      tool: "investigate",
      message: String(payload.message ?? "Backend investigation failed."),
      status: "warning",
      confidence: 0.3,
      source: "Express backend",
    });
  }

  return null;
}

export { apiUrl };
