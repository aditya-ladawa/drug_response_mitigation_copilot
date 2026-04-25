import type { AgentEvent, CopilotGraph } from "@/types/copilot";

const graphTheme = {
  drug: "#ffffff",
  manufacturer: "#67e8f9",
  plant: "#f97316",
  recall: "#fb7185",
  warning: "#facc15",
  shortage: "#a78bfa",
  ingredient: "#34d399",
} as const;

const normalizeDrug = (name: string) => {
  const value = decodeURIComponent(name || "").trim();
  return value.length > 0 ? value : "Amoxicillin";
};

export function getMockGraph(name: string): CopilotGraph {
  const drug = normalizeDrug(name);
  const seed = drug.toLowerCase();
  const isAdderall = seed.includes("adderall");
  const isVincristine = seed.includes("vincristine");
  const affectedSupply = isAdderall ? 54 : isVincristine ? 72 : 68;
  const confidence = isVincristine ? 0.86 : isAdderall ? 0.78 : 0.82;

  const manufacturer = isAdderall
    ? "Northstar Generics"
    : isVincristine
      ? "OncoCore Steriles"
      : "Acme Pharma";

  const problemPlant = isAdderall
    ? "Phoenix oral-solid site"
    : isVincristine
      ? "Cincinnati sterile fill-finish"
      : "Cincinnati suspension plant";

  const upstreamPlant = isAdderall
    ? "Hyderabad API partner"
    : isVincristine
      ? "Basel oncology API line"
      : "Mumbai API facility";

  return {
    drug,
    summary:
      "Signals point to a concentrated manufacturing dependency with a quality event at the primary site and limited near-term substitute capacity.",
    metrics: {
      riskLevel: affectedSupply > 65 ? "high" : "medium",
      riskScore: affectedSupply > 65 ? 86 : 74,
      affectedSupply,
      confidence,
      primaryPlant: problemPlant,
      eta: isVincristine ? "10-14 days" : isAdderall ? "14-21 days" : "7-10 days",
      substitutes: isVincristine ? 2 : isAdderall ? 4 : 5,
    },
    recommendations: [
      "Prioritize conservation protocol for high-dependency accounts.",
      "Contact alternate suppliers with available therapeutic substitutes.",
      "Monitor FDA shortage updates and manufacturer remediation signals daily.",
    ],
    nodes: [
      {
        id: "drug",
        name: drug,
        type: "drug",
        val: 8,
        color: graphTheme.drug,
        description: "Queried shortage product",
        impact: "Central product under investigation.",
        confidence,
        evidence: [
          "Matched the query to shortage and manufacturer graph entities.",
          "Linked active ingredient and supply-chain dependencies at depth 2.",
        ],
      },
      {
        id: "shortage",
        name: "FDA shortage notice",
        type: "shortage",
        val: 5,
        color: graphTheme.shortage,
        impact: "Regulatory shortage signal is active.",
        confidence: 0.84,
        evidence: [
          "Public shortage listing indicates supply pressure.",
          "Status aligns with current modeled operational impact.",
        ],
      },
      {
        id: "mfr-primary",
        name: manufacturer,
        type: "manufacturer",
        val: 6,
        color: graphTheme.manufacturer,
        owner: "Entity Resolver",
        impact: "Primary resolved manufacturer for the queried product.",
        confidence: 0.8,
        evidence: [
          "Manufacturer aliases resolved across labeler and facility references.",
          "Connected to the implicated production site in the graph.",
        ],
      },
      {
        id: "plant-problem",
        name: problemPlant,
        type: "plant",
        val: 7,
        color: graphTheme.plant,
        lat: isAdderall ? 33.4484 : 39.1031,
        lng: isAdderall ? -112.074 : -84.512,
        risk: "high",
        description: "Primary implicated plant. Estimated 68% supply dependency.",
        owner: "Investigator",
        impact: `${affectedSupply}% modeled supply dependency; highest root-cause priority.`,
        confidence,
        evidence: [
          "Quality signal overlaps with the primary manufacturing dependency.",
          "Limited substitute capacity increases mitigation urgency.",
          "Adjacent line signal suggests shared operational exposure.",
        ],
      },
      {
        id: "plant-upstream",
        name: upstreamPlant,
        type: "plant",
        val: 5,
        color: graphTheme.ingredient,
        lat: isVincristine ? 47.5596 : 19.076,
        lng: isVincristine ? 7.5886 : 72.8777,
        risk: "medium",
        description: "Upstream input or API dependency.",
        owner: "Risk Propagator",
        impact: "Upstream dependency could slow recovery if primary remediation succeeds.",
        confidence: 0.71,
        evidence: [
          "API dependency is connected to the primary production site.",
          "Secondary risk remains medium because alternate input routing is possible.",
        ],
      },
      {
        id: "warning-letter",
        name: "CGMP warning letter",
        type: "warning",
        val: 5,
        color: graphTheme.warning,
        owner: "Regulatory Monitor",
        impact: "Strong quality signal connected to the implicated plant.",
        confidence: 0.88,
        evidence: [
          "CGMP issue increases likelihood of production interruption.",
          "Signal is directly linked to the highest-risk plant node.",
        ],
      },
      {
        id: "recall",
        name: "Adjacent line recall",
        type: "recall",
        val: 4,
        color: graphTheme.recall,
        owner: "Recall Monitor",
        impact: "Related recall may indicate shared process or quality exposure.",
        confidence: 0.66,
        evidence: [
          "Recall is not definitive root cause, but raises adjacent-line risk.",
          "Weighted lower than the direct CGMP signal.",
        ],
      },
      {
        id: "ingredient",
        name: isAdderall ? "Mixed amphetamine salts" : isVincristine ? "Vincristine sulfate" : "Amoxicillin trihydrate",
        type: "ingredient",
        val: 4,
        color: graphTheme.ingredient,
        impact: "Active ingredient dependency used for substitute and sourcing analysis.",
        confidence: 0.76,
        evidence: [
          "Ingredient connects upstream API and finished-dose production.",
          "Substitute planning depends on this node and therapeutic class.",
        ],
      },
    ],
    links: [
      { source: "drug", target: "shortage", label: "listed in", strength: 1, color: "#a78bfa" },
      { source: "drug", target: "mfr-primary", label: "supplied by", strength: 1, color: "#67e8f9" },
      { source: "mfr-primary", target: "plant-problem", label: "manufactures at", strength: 1, color: "#f97316" },
      { source: "plant-problem", target: "warning-letter", label: "quality signal", strength: 0.9, color: "#facc15" },
      { source: "plant-problem", target: "recall", label: "shared line risk", strength: 0.6, color: "#fb7185" },
      { source: "ingredient", target: "plant-upstream", label: "sourced from", strength: 0.8, color: "#34d399" },
      { source: "plant-upstream", target: "plant-problem", label: "supply chain flow", strength: 0.7, color: "#34d399" },
      { source: "ingredient", target: "drug", label: "active ingredient", strength: 0.9, color: "#34d399" },
    ],
  };
}

export function getAgentEvents(drug: string): AgentEvent[] {
  const base = Date.now();
  const stamp = (offsetSeconds: number) => new Date(base + offsetSeconds * 1000).toISOString();

  return [
    {
      id: "evt-1",
      agent: "Shortage Resolver",
      tool: "searchShortages",
      message: `Matched ${drug} against FDA and ASHP shortage records. Current status suggests active operational pressure.`,
      status: "complete",
      timestamp: stamp(1),
      confidence: 0.84,
      source: "FDA/ASHP shortage records",
      durationMs: 680,
    },
    {
      id: "evt-2",
      agent: "Entity Resolver",
      tool: "getManufacturerProfile",
      message: "Resolved manufacturer, labeler, and implicated facility aliases across public records.",
      status: "complete",
      timestamp: stamp(2),
      confidence: 0.8,
      source: "Manufacturer profile index",
      durationMs: 920,
    },
    {
      id: "evt-3",
      agent: "Investigator",
      tool: "rankRootCauses",
      message:
        "Root cause: likely CGMP violation at the primary plant. Dependency estimate: 68% of modeled supply.",
      status: "warning",
      timestamp: stamp(3),
      confidence: 0.82,
      source: "Quality and dependency model",
      durationMs: 1240,
    },
    {
      id: "evt-4",
      agent: "Risk Propagator",
      tool: "expandExposureGraph",
      message: "Added upstream API dependency and adjacent recall signal. Knowledge graph depth is now 2.",
      status: "complete",
      timestamp: stamp(4),
      confidence: 0.74,
      source: "Supply-chain graph",
      durationMs: 760,
    },
    {
      id: "evt-5",
      agent: "Mitigation Planner",
      tool: "generateRoleActions",
      message:
        "Next action: start pharmacy conservation protocol, review substitutions, and diversify sourcing within 7 days.",
      status: "complete",
      timestamp: stamp(5),
      confidence: 0.79,
      source: "Mitigation playbook",
      durationMs: 540,
    },
  ];
}
