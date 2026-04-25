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
    nodes: [
      {
        id: "drug",
        name: drug,
        type: "drug",
        val: 8,
        color: graphTheme.drug,
        description: "Queried shortage product",
      },
      {
        id: "shortage",
        name: "FDA shortage notice",
        type: "shortage",
        val: 5,
        color: graphTheme.shortage,
      },
      {
        id: "mfr-primary",
        name: manufacturer,
        type: "manufacturer",
        val: 6,
        color: graphTheme.manufacturer,
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
      },
      {
        id: "warning-letter",
        name: "CGMP warning letter",
        type: "warning",
        val: 5,
        color: graphTheme.warning,
      },
      {
        id: "recall",
        name: "Adjacent line recall",
        type: "recall",
        val: 4,
        color: graphTheme.recall,
      },
      {
        id: "ingredient",
        name: isAdderall ? "Mixed amphetamine salts" : isVincristine ? "Vincristine sulfate" : "Amoxicillin trihydrate",
        type: "ingredient",
        val: 4,
        color: graphTheme.ingredient,
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
  return [
    {
      id: "evt-1",
      agent: "Shortage Resolver",
      tool: "searchShortages",
      message: `Matched ${drug} against FDA and ASHP shortage records. Current status suggests active operational pressure.`,
      status: "complete",
    },
    {
      id: "evt-2",
      agent: "Entity Resolver",
      tool: "getManufacturerProfile",
      message: "Resolved manufacturer, labeler, and implicated facility aliases across public records.",
      status: "complete",
    },
    {
      id: "evt-3",
      agent: "Investigator",
      tool: "rankRootCauses",
      message:
        "Root cause: likely CGMP violation at the primary plant. Dependency estimate: 68% of modeled supply.",
      status: "warning",
    },
    {
      id: "evt-4",
      agent: "Risk Propagator",
      tool: "expandExposureGraph",
      message: "Added upstream API dependency and adjacent recall signal. Knowledge graph depth is now 2.",
      status: "complete",
    },
    {
      id: "evt-5",
      agent: "Mitigation Planner",
      tool: "generateRoleActions",
      message:
        "Next action: start pharmacy conservation protocol, review substitutions, and diversify sourcing within 7 days.",
      status: "complete",
    },
  ];
}
