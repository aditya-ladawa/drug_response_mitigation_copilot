export const primaryLinks = [
  { label: "Investigate.", href: "/#investigate" },
  { label: "Anticipate.", href: "/#surfaces" },
  { label: "Mitigate.", href: "/#workflow" },
  { label: "Manifesto", href: "/manifesto" },
  { label: "Studio", href: "/studio" },
] as const;

export const overlayFacts = [
  "13 public sources connected",
  "6 agent roles planned",
  "Evidence-first command center",
] as const;

export const surfaceCards = [
  {
    index: "01",
    title: "Investigation",
    blurb:
      "Rank likely causes with public evidence before the shortage discussion turns into guesswork.",
  },
  {
    index: "02",
    title: "Risk Propagation",
    blurb:
      "Trace what else is exposed when the same manufacturer, plant, or ingredient is under pressure.",
  },
  {
    index: "03",
    title: "Mitigation Planning",
    blurb:
      "Translate fragmented signals into specific moves for pharmacy, procurement, and clinical teams.",
  },
  {
    index: "04",
    title: "Scenario Lab",
    blurb:
      "Model supplier loss, demand spikes, or substitutions before those changes hit real operations.",
  },
] as const;

export const homeMetrics = [
  {
    value: "13",
    label: "Public sources",
    detail: "FDA, ASHP, DailyMed, CMS, GDELT",
  },
  {
    value: "4",
    label: "Decision layers",
    detail: "Investigate, map, respond, simulate",
  },
  {
    value: "6",
    label: "Agent roles",
    detail: "Resolver, investigator, planner, analyst",
  },
  {
    value: "1",
    label: "Unified surface",
    detail: "Graph, timeline, map, action panel",
  },
] as const;

export const caseStudies = [
  {
    id: "amoxicillin",
    label: "Amoxicillin suspension",
    summary:
      "Oral pediatric demand meets supplier fragility. Signals suggest a quality interruption plus a demand shock from competitor instability.",
    causes: [
      {
        title: "Quality issue at primary supplier",
        confidence: "High confidence",
        evidence: "Warning letters and shortage timing align around the same supply path.",
      },
      {
        title: "Import restriction on upstream ingredient flow",
        confidence: "Medium confidence",
        evidence: "Import alerts indicate pressure on bulk substance inflow for adjacent products.",
      },
      {
        title: "Demand jump after alternate product disruption",
        confidence: "Medium confidence",
        evidence: "ASHP and news signals suggest substitution-driven demand concentration.",
      },
    ],
    timeline: [
      "Warning letter logged",
      "Import alert attached",
      "FDA shortage posted",
      "ASHP shortage confirmed",
      "Demand spike signal detected",
    ],
    exposures: ["Ampicillin", "Augmentin suspension", "Penicillin VK"],
  },
  {
    id: "vincristine",
    label: "Vincristine injection",
    summary:
      "A critical oncology product with thin supplier redundancy. Regulatory friction at one site propagates fast through therapy lines.",
    causes: [
      {
        title: "Single-site manufacturing concentration",
        confidence: "High confidence",
        evidence: "Establishment and labeler relationships collapse onto a narrow production footprint.",
      },
      {
        title: "Recall pressure on adjacent sterile line",
        confidence: "Medium confidence",
        evidence: "Enforcement records in neighboring sterile products indicate shared quality exposure.",
      },
      {
        title: "Limited therapeutic fallback",
        confidence: "Medium confidence",
        evidence: "Orange Book and regimen constraints reduce substitution flexibility.",
      },
    ],
    timeline: [
      "Sterile line issue surfaces",
      "Recall signal escalates",
      "Shortage record opens",
      "Clinical watchlist expands",
      "Fallback sourcing begins",
    ],
    exposures: ["Vinblastine", "Cyclophosphamide", "Doxorubicin"],
  },
  {
    id: "adderall",
    label: "Adderall XR",
    summary:
      "A mixed-demand and manufacturing story. Market pressure amplifies every operational hiccup across equivalent products.",
    causes: [
      {
        title: "Capacity strain across a concentrated supplier set",
        confidence: "High confidence",
        evidence: "Shortage status and market demand indicators point to sustained utilization pressure.",
      },
      {
        title: "Regulatory events around related facilities",
        confidence: "Medium confidence",
        evidence: "Warning-letter style signals cluster around a connected operating network.",
      },
      {
        title: "Substitution ripple from adjacent ADHD products",
        confidence: "Medium confidence",
        evidence: "Therapeutic equivalence and news coverage indicate spillover demand.",
      },
    ],
    timeline: [
      "Demand acceleration appears",
      "Facility signal cluster grows",
      "Shortage status persists",
      "Equivalent products absorb demand",
      "Monitoring plan expands",
    ],
    exposures: ["Methylphenidate ER", "Dexmethylphenidate XR", "Lisdexamfetamine"],
  },
] as const;

export const pillars = [
  {
    index: "I",
    title: "Investigation",
    eyebrow: "Signals turned into a cause chain",
    description:
      "The interface should let teams see why a shortage is happening, not just that it exists. It gathers public evidence, ranks likely causes, and keeps the reasoning inspectable.",
    bullets: [
      "Shortage records, recalls, warning letters, and import alerts in one thread",
      "Ranked hypotheses with evidence-backed language",
      "A command-room layout instead of a dashboard dump",
    ],
    visualLabel: "AMOXICILLIN CASE",
    visualStats: ["3 hypotheses", "6 citations", "2 implicated facilities"],
  },
  {
    index: "II",
    title: "Risk Propagation",
    eyebrow: "The adjacent products matter too",
    description:
      "A shortage almost never stops at one SKU. The graph needs to expose nearby products, facilities, and therapeutic classes that share the same upstream fragility.",
    bullets: [
      "Manufacturer and plant dependency mapping",
      "At-risk product expansion before a shortage spreads",
      "Context that operators can act on without reading raw records",
    ],
    visualLabel: "EXPOSURE GRAPH",
    visualStats: ["14 connected nodes", "4 shared facilities", "2 watchlist tiers"],
  },
  {
    index: "III",
    title: "Mitigation Planning",
    eyebrow: "Different roles need different actions",
    description:
      "Pharmacy, procurement, and clinical users should not all receive the same summary. The experience needs role-specific moves with evidence and urgency built in.",
    bullets: [
      "24-hour actions for pharmacy operations",
      "7-day sourcing moves for procurement",
      "Clinical pathway guidance framed with caution and provenance",
    ],
    visualLabel: "ACTION GRID",
    visualStats: ["3 stakeholder lanes", "9 recommended moves", "1 export surface"],
  },
  {
    index: "IV",
    title: "Scenario Lab",
    eyebrow: "Simulate before the next escalation",
    description:
      "The product becomes much more valuable when teams can test supplier loss, demand spikes, or substitutions before making a call. That turns the UI into a resilience workspace.",
    bullets: [
      "Supplier-loss and demand-shock what-if flows",
      "Before and after impact framing",
      "Confidence and uncertainty surfaced plainly",
    ],
    visualLabel: "SCENARIO RUN",
    visualStats: ["2 simulated shocks", "18 downstream products", "1 resilience score"],
  },
] as const;

export const signalGroups = [
  {
    title: "Regulatory signals",
    description:
      "Warning letters, recalls, import alerts, and shortage notices establish the first layer of evidence.",
    sources: [
      "FDA Drug Shortages",
      "openFDA Drug Enforcement",
      "FDA Warning Letters",
      "FDA Import Alerts",
    ],
  },
  {
    title: "Product and label context",
    description:
      "NDC, DailyMed, and Orange Book records help connect products, applicants, formulations, and therapeutic alternatives.",
    sources: ["openFDA NDC", "DailyMed SPLs", "FDA Orange Book"],
  },
  {
    title: "Manufacturing footprint",
    description:
      "Establishment and company data expose the physical network behind a shortage and show how concentrated it really is.",
    sources: ["FDA Drug Establishments", "Applicant and labeler relationships"],
  },
  {
    title: "Weak signals and demand context",
    description:
      "News and market data add the softer layer that explains why a fragile situation suddenly becomes operationally painful.",
    sources: ["GDELT Doc API", "ASHP Drug Shortages", "CMS Medicare Part D", "CMS Open Payments"],
  },
] as const;

export const workflowSteps = [
  {
    number: "01",
    title: "Ingest",
    detail:
      "Refresh the offline artifact layer and keep source-specific fetch logic stable.",
  },
  {
    number: "02",
    title: "Normalize",
    detail:
      "Convert every source into typed internal entities for drugs, manufacturers, plants, and events.",
  },
  {
    number: "03",
    title: "Connect",
    detail:
      "Resolve relationships so a product can be traced through labelers, establishments, and regulatory history.",
  },
  {
    number: "04",
    title: "Explain",
    detail:
      "Let agents assemble cause chains, evidence, and adjacent risks without hiding uncertainty.",
  },
  {
    number: "05",
    title: "Act",
    detail:
      "Turn investigation output into role-specific moves and scenario-based planning.",
  },
] as const;

export const agentStack = [
  {
    name: "Entity Resolver",
    role:
      "Matches drugs, NDCs, labelers, applicants, and plants across fragmented public records.",
  },
  {
    name: "Investigator",
    role:
      "Builds ranked shortage explanations from regulatory, product, and news evidence.",
  },
  {
    name: "Risk Propagator",
    role:
      "Finds nearby products and dependencies exposed to the same upstream pressure.",
  },
  {
    name: "Mitigation Planner",
    role:
      "Generates role-based moves for pharmacy, procurement, and clinical teams.",
  },
  {
    name: "Scenario Analyst",
    role:
      "Tests supplier loss, demand shifts, and substitution strategies before a decision is made.",
  },
  {
    name: "Orchestrator",
    role:
      "Coordinates the full investigation flow into one coherent operator-facing response.",
  },
] as const;

export const manifestoPrinciples = [
  {
    title: "Evidence before opinion",
    body:
      "Every claim should be tied back to a public signal, a graph relationship, or an explicit uncertainty statement.",
  },
  {
    title: "Relationships over isolated alerts",
    body:
      "The interface wins when it shows how a warning letter, a plant, and a product shortage belong to the same story.",
  },
  {
    title: "Action is role-specific",
    body:
      "Pharmacy, procurement, and clinical users should each leave with a next move that fits their real job.",
  },
  {
    title: "Simulation belongs in the core flow",
    body:
      "A shortage tool is stronger when users can pressure-test choices before a disruption worsens.",
  },
  {
    title: "Design should reduce panic",
    body:
      "The UI should feel calm, sharp, and legible even when the underlying story is messy or time-sensitive.",
  },
  {
    title: "The product is a command center",
    body:
      "This is not a tracker and not a chatbot. It is a place to investigate, understand exposure, and decide what to do next.",
  },
] as const;

export const nonNegotiables = [
  "Not a generic analytics dashboard",
  "Not a summarization layer without provenance",
  "Not a prediction gimmick detached from evidence",
] as const;

export const studioTracks = [
  {
    title: "Pharmacy operations",
    focus:
      "Conservation, substitution safety, patient communication, and near-term continuity planning.",
  },
  {
    title: "Procurement teams",
    focus:
      "Alternate manufacturers, exposure watchlists, sourcing diversification, and escalation triggers.",
  },
  {
    title: "Clinical leadership",
    focus:
      "Pathway adjustments, therapeutic equivalence review, and decision support with clear caution framing.",
  },
  {
    title: "Policy and system strategy",
    focus:
      "Network fragility analysis, resilience planning, and evidence for broader intervention design.",
  },
] as const;

export const studioProcess = [
  "Map the first high-value shortage journeys",
  "Tie the UI directly to the normalized data model",
  "Make graph, timeline, and action panel feel like one product",
  "Layer in scenario testing only after evidence views are trustworthy",
  "Keep every interaction legible enough for live operator use",
] as const;

export const footerGroups = [
  {
    heading: "Navigate",
    links: [
      { label: "Home", href: "/" },
      { label: "Manifesto", href: "/manifesto" },
      { label: "Studio", href: "/studio" },
    ],
  },
  {
    heading: "Surfaces",
    links: [
      { label: "Investigate", href: "/#investigate" },
      { label: "Anticipate", href: "/#surfaces" },
      { label: "Mitigate", href: "/#workflow" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "Plan", href: "/#sources" },
      { label: "Agent Stack", href: "/#agents" },
      { label: "Contact Surface", href: "/#contact" },
    ],
  },
] as const;
