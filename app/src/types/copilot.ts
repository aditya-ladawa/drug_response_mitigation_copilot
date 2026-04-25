export type GraphNodeType =
  | "drug"
  | "manufacturer"
  | "plant"
  | "recall"
  | "warning"
  | "shortage"
  | "ingredient";

export type CopilotNode = {
  id: string;
  name: string;
  type: GraphNodeType;
  val?: number;
  color?: string;
  lat?: number;
  lng?: number;
  x?: number;
  y?: number;
  risk?: "low" | "medium" | "high";
  description?: string;
  evidence?: string[];
  impact?: string;
  owner?: string;
  confidence?: number;
};

export type CopilotLink = {
  source: string | CopilotNode;
  target: string | CopilotNode;
  label?: string;
  strength?: number;
  color?: string;
};

export type CopilotGraph = {
  drug: string;
  summary: string;
  metrics: {
    riskLevel: "low" | "medium" | "high";
    riskScore: number;
    affectedSupply: number;
    confidence: number;
    primaryPlant: string;
    eta: string;
    substitutes: number;
  };
  recommendations: string[];
  nodes: CopilotNode[];
  links: CopilotLink[];
};

export type GlobePoint = CopilotNode & {
  lat: number;
  lng: number;
};

export type SupplyArc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string[];
  label: string;
};

export type AgentEvent = {
  id: string;
  agent: string;
  tool: string;
  message: string;
  status: "queued" | "running" | "complete" | "warning";
  timestamp: string;
  confidence?: number;
  source?: string;
  durationMs?: number;
};
