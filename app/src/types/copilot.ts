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
};

export type CopilotLink = {
  source: string;
  target: string;
  label?: string;
  strength?: number;
  color?: string;
};

export type CopilotGraph = {
  drug: string;
  summary: string;
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
};
