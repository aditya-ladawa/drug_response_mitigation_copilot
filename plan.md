# Drug Shortage Response & Mitigation Copilot — Hackathon Build Plan

## Team

| Role | Person | Focus |
|------|--------|-------|
| **Agentic AI Lead** | Member 1 | Claude-powered agents, tool-use chains, investigation/reasoning pipelines, prompt engineering, agentic orchestration |
| **Full-Stack Engineer** | Member 2 | Next.js app, data ingestion, parsing, graph construction, UI components, deployment |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Next.js App (App Router)                 │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   React Client UI                       │ │
│  │  Dashboard · Graph (react-force-graph) · Timeline       │ │
│  │  Map (react-leaflet) · Chat · Scenario Lab              │ │
│  │  UI Kit: shadcn/ui + Tailwind CSS                       │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │              Next.js API Routes + Server Actions         │ │
│  │    /api/investigate · /api/shortages · /api/chat         │ │
│  │    /api/scenario · /api/graph · /api/drug/[name]         │ │
│  │    Streaming via Vercel AI SDK                           │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │          Claude Agentic Layer (Tool-Use)                 │ │
│  │   Vercel AI SDK (@ai-sdk/anthropic) + tool definitions   │ │
│  │                                                         │ │
│  │  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐ │ │
│  │  │ Investigation│ │ Risk          │ │ Mitigation     │ │ │
│  │  │ Agent        │ │ Propagation   │ │ Planner Agent  │ │ │
│  │  └──────────────┘ └───────────────┘ └────────────────┘ │ │
│  │  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐ │ │
│  │  │ Entity       │ │ Scenario      │ │ Evidence       │ │ │
│  │  │ Resolver     │ │ Analyst       │ │ Miner          │ │ │
│  │  └──────────────┘ └───────────────┘ └────────────────┘ │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │         Knowledge Graph + Data Store (Server-side)       │ │
│  │    SQLite (better-sqlite3) + Drizzle ORM                │ │
│  │    In-memory graph: graphology                           │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │           Data Ingestion Scripts (TypeScript)            │ │
│  │    cheerio (HTML) · xlsx (Excel) · adm-zip (ZIP)         │ │
│  │    Parses artifacts from data_access/artifacts/           │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

External: data_access/fetch_all.py (Python, kept as-is for data refresh)
```

### Why Next.js over Python/Streamlit

| Concern | Python (Streamlit) | Next.js (TypeScript) |
|---------|-------------------|---------------------|
| Graph visualization | pyvis/streamlit-agraph (limited interactivity) | react-force-graph, cytoscape.js, sigma.js (GPU-accelerated, rich interaction) |
| Timeline | Plotly in iframe | Custom React + Tailwind, or recharts scatter timeline |
| Map | Plotly static or folium | react-leaflet / Mapbox GL (smooth, interactive) |
| Streaming AI | SSE hacks in Streamlit | Native with Vercel AI SDK + React hooks |
| Layout control | Streamlit's rigid column model | Full CSS/Tailwind freedom |
| Component ecosystem | Limited | shadcn/ui, Radix, thousands of React libs |
| Type safety | Optional (mypy) | Built-in (TypeScript) |
| Deployment | Needs separate server | Single `next start` or Vercel deploy |
| Real-time UX | Page reruns on interaction | Component-level reactivity |

### Hybrid Decision: Keep `fetch_all.py` in Python

The data fetching script (`data_access/fetch_all.py`) is already working and tested. It's a one-time offline utility, not part of the app runtime. Rewriting it in Node.js wastes hackathon time for zero user-facing benefit. We keep it as-is. All **parsing** of the downloaded artifacts happens in TypeScript within the Next.js app.

---

## Phase 0 — Project Bootstrap (Hours 0–1)

**Goal:** Next.js app running, dependencies installed, folder structure ready.

### Member 2 (Full-Stack)
- [ ] Initialize Next.js project inside repo:
  ```bash
  npx create-next-app@latest app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
  ```
- [ ] Install core dependencies:
  ```bash
  # AI
  npm i ai @ai-sdk/anthropic
  
  # Database
  npm i better-sqlite3 drizzle-orm
  npm i -D drizzle-kit @types/better-sqlite3
  
  # Data parsing
  npm i cheerio xlsx adm-zip csv-parse
  npm i -D @types/adm-zip
  
  # Graph
  npm i graphology graphology-traversal graphology-shortest-path
  # Note: graphology ships its own TypeScript types — no @types needed
  
  # Visualization
  npm i react-force-graph-2d recharts react-leaflet leaflet
  npm i -D @types/leaflet
  # Note: recharts (136kB gzipped, tree-shakeable) replaces Plotly (348kB, non-tree-shakeable)
  # react-force-graph-2d, react-leaflet MUST use next/dynamic({ ssr: false }) — they access window/canvas
  
  # UI components
  npx shadcn@latest init
  npx shadcn@latest add button card input tabs table badge dialog sheet command separator scroll-area textarea select
  
  # State + utils
  npm i zustand zod fuse.js
  
  # Runtime: Node.js LTS (20 or 22) REQUIRED for better-sqlite3 prebuilt binaries on Windows
  ```
- [ ] Create full folder structure (see File Structure section)
- [ ] Set up `.env.local` with `ANTHROPIC_API_KEY`
- [ ] Create Drizzle config and initial SQLite schema (`lib/db/schema.ts`)
- [ ] Verify `npm run dev` serves a landing page

### Member 1 (Agentic AI)
- [ ] Verify Claude access via `@ai-sdk/anthropic`
- [ ] Create `lib/agents/tools.ts` — define all tool schemas using Zod
- [ ] Create `lib/agents/prompts.ts` — draft system prompts for each agent role
- [ ] Build a minimal test: call Claude with one tool, confirm tool-use loop works
- [ ] Define tool interface contracts (exact input/output TypeScript types for every tool)

### Deliverable
> `npm run dev` serves the app. Claude tool-use works in a test. SQLite schema created. Both members can work independently.

---

## Phase 1 — Data Ingestion & Normalization (Hours 1–4)

**Goal:** Parse all 13 data source artifacts into typed, queryable data in SQLite.

### Member 2 (Full-Stack)

#### 1A — Drizzle Schema (SQLite tables)

```typescript
// lib/db/schema.ts — Drizzle table definitions

drugs: { id, genericName, brandNames (JSON), activeIngredients (JSON), therapeuticClass }
ndcs: { id, ndcCode, drugId (FK), labeler, packageDescription }
manufacturers: { id, name, normalizedName }
establishments: { id, name, feiNumber, address, city, state, country, operations, manufacturerId (FK) }
shortageRecords: { id, drugId (FK), status, reason, startDate, endDate, source, sourceUrl }
recallEvents: { id, product, reason, classification, recallDate, firm, drugId (FK), manufacturerId (FK) }
warningLetters: { id, company, subject, issueDate, url, letterId, manufacturerId (FK) }
importAlerts: { id, alertNumber, product, firm, country, charge, manufacturerId (FK) }
orangeBookEntries: { id, ingredient, tradeName, applicant, teCode, type, drugId (FK) }
splLabels: { id, setId, title, effectiveDate, labeler }
newsSignals: { id, title, url, publishDate, source, tone, themes (JSON) }
```

#### 1B — Build Parsers (one per source, in `lib/ingestion/`)

| Source File | Parser | Node.js Lib | Output |
|-------------|--------|-------------|--------|
| `fda_drug_shortages.html` | `parse-fda-shortages.ts` | cheerio | `ShortageRecord[]` |
| `openfda_drug_enforcement.json` | `parse-enforcement.ts` | native JSON | `RecallEvent[]` |
| `fda_warning_letters_xlsx.xlsx` | `parse-warning-letters.ts` | xlsx | `WarningLetter[]` |
| `fda_warning_letters_page.html` | `parse-warning-letters-html.ts` | cheerio | `WarningLetter[]` |
| `fda_import_alerts.html` | `parse-import-alerts.ts` | cheerio | `ImportAlert[]` |
| `openfda_ndc.json` | `parse-ndc.ts` | native JSON | `NDC[]` |
| `dailymed_spls.json` | `parse-dailymed.ts` | native JSON | `SPLLabel[]` |
| `fda_drug_establishments.zip` | `parse-establishments.ts` | adm-zip + csv-parse | `Establishment[]` |
| `fda_orange_book.zip` | `parse-orange-book.ts` | adm-zip + csv-parse | `OrangeBookEntry[]` |
| `gdelt_doc_api.json` | `parse-gdelt.ts` | native JSON | `NewsSignal[]` |
| `ashp_drug_shortages.html` | `parse-ashp.ts` | cheerio | `ShortageRecord[]` |
| `cms_medicare_part_d.json` | `parse-cms-partd.ts` | native JSON | usage records |
| `cms_open_payments.json` | `parse-cms-payments.ts` | native JSON | catalog records |

#### 1C — Ingestion Script

- `scripts/ingest.ts` — orchestrates all parsers, inserts into SQLite via Drizzle
- Executable via: `npx tsx scripts/ingest.ts`
- Creates `data/drug_shortage.db`

### Member 1 (Agentic AI)

#### 1D — Implement Agent Tool Functions

```typescript
// lib/agents/tools.ts — each tool has Zod schema + execute function

searchDrugs({ query: string }) → Drug[]
searchShortages({ drugName: string }) → ShortageRecord[]
searchRecalls({ query: string, by: "drug" | "manufacturer" }) → RecallEvent[]
searchWarningLetters({ query: string }) → WarningLetter[]
searchImportAlerts({ query: string }) → ImportAlert[]
getDrugDetails({ identifier: string }) → Drug & { ndcs, labels, shortages }
getManufacturerProfile({ name: string }) → Manufacturer & { establishments, warnings, alerts }
getTherapeuticAlternatives({ drugName: string }) → Drug[]  // Orange Book TE codes
getSupplyChainGraph({ drugName: string, depth?: number }) → GraphJSON
searchNews({ query: string }) → NewsSignal[]
getTimeline({ drugName: string }) → TimelineEvent[]
```

#### 1E — Entity Resolution

- `lib/agents/entity-resolver.ts`
- Fuzzy match drug names across sources using `fuse.js`
- Normalize manufacturer names (uppercase, strip "Inc.", "LLC", "Ltd.")
- Map NDC labeler codes → manufacturer entities
- Deduplicate drugs across FDA, ASHP, openFDA, DailyMed

### Deliverable
> All 13 sources parsed into SQLite. Tool functions query DB correctly. Entity resolution works.

---

## Phase 2 — Knowledge Graph + Core Agents (Hours 4–6)

**Goal:** Build the connected dependency graph. Wire up Investigation and Risk Propagation agents.

### Member 2 (Full-Stack)

#### 2A — Graph Construction (graphology)

```typescript
// lib/graph/builder.ts

// Node types:
"drug"           → { genericName, shortageStatus }
"ndc"            → { ndcCode }
"manufacturer"   → { name }
"establishment"  → { feiNumber, city, country }
"shortage"       → { status, reason, startDate }
"recall"         → { classification, recallDate }
"warning_letter" → { subject, issueDate }
"import_alert"   → { alertNumber, charge }

// Edges:
drug --has_ndc--> ndc
ndc --labeled_by--> manufacturer
manufacturer --operates--> establishment
establishment --received--> warning_letter
manufacturer --subject_of--> import_alert
drug --in_shortage--> shortage
drug --recalled_as--> recall
drug --therapeutic_equivalent--> drug
drug --same_ingredient--> drug
```

#### 2B — Graph Queries

```typescript
// lib/graph/queries.ts
getSubgraph(nodeId, depth) → SerializedGraph
getNeighbors(nodeId, edgeType?) → Node[]
findPaths(from, to) → Path[]
getRiskCluster(manufacturerId) → { drugs, establishments, alerts }
```

#### 2C — Serialization for react-force-graph

```typescript
// lib/graph/serializer.ts → { nodes: NodeData[], links: LinkData[] }
// Node color/size based on type and risk level
```

### Member 1 (Agentic AI)

#### 2D — Investigation Agent

**Core question:** "Why is this drug in shortage?"

```typescript
// lib/agents/investigator.ts — uses Vercel AI SDK streamText() with tools
// CRITICAL: must set maxSteps >= 8 to allow multi-turn tool-use loop
//   streamText({ model, system, messages, tools, maxSteps: 10 })
// Without maxSteps, agent makes only ONE tool call and stops.

// Step 1: searchShortages(drug) → shortage records
// Step 2: getDrugDetails(drug) → NDCs, manufacturers
// Step 3: searchRecalls(drug) + searchRecalls(manufacturer)
// Step 4: searchWarningLetters(manufacturer)
// Step 5: searchImportAlerts(manufacturer)
// Step 6: searchNews(drug + "shortage")
// Step 7: Synthesize ranked causes with evidence citations
```

System prompt enforces:
- Evidence-backed reasoning only
- Confidence: HIGH / MEDIUM / LOW per cause
- Cite specific source per claim
- Structured output with `causes[]`, `evidence[]`, `summary`

#### 2E — Risk Propagation Agent

**Core question:** "What else is at risk?"

```typescript
// lib/agents/risk-propagator.ts
// 1. Identify implicated manufacturers/plants from investigation
// 2. getSupplyChainGraph(drug) → find connected drugs
// 3. For each connected drug → check status
// 4. Output: ranked at-risk drugs with reasoning
```

### Deliverable
> Knowledge graph connected. Investigation agent streams root-cause analysis. Risk agent finds downstream risks.

---

## Phase 3 — Mitigation + Scenario + API (Hours 6–8)

**Goal:** Action recommendations, what-if simulation, all API routes.

### Member 1 (Agentic AI)

#### 3A — Mitigation Planner Agent

```typescript
// lib/agents/mitigation-planner.ts
// Takes investigation → role-specific actions:

// PHARMACY (24h): conservation, substitutes, patient comms
// PROCUREMENT (7d): alt manufacturers, diversification, contract triggers
// CLINICAL (ongoing): pathway mods, dosage adjustments, monitoring
```

#### 3B — Scenario Analyst Agent

```typescript
// lib/agents/scenario-analyst.ts
// Tools:
simulateSupplierLoss({ manufacturer }) → ImpactAssessment
simulateDemandChange({ drug, percentChange }) → RiskAssessment
simulateSubstitution({ fromDrug, toDrug }) → FeasibilityReport

// Uses graph traversal for impact tracing
```

#### 3C — Orchestrator

```typescript
// lib/agents/orchestrator.ts
// Single entry point:
// 1. Entity resolution on user query
// 2. Investigation Agent → streams results
// 3. Risk Propagation → risk analysis
// 4. Mitigation Planner → actions
// Returns unified InvestigationResult
// Also handles freeform chat with all tools available
```

### Member 2 (Full-Stack)

#### 3D — API Routes

```
POST /api/investigate         → streaming investigation
POST /api/chat                → freeform chat (streaming)
GET  /api/shortages           → all current shortages
GET  /api/drug/[name]         → drug detail
GET  /api/drug/[name]/timeline → event timeline
GET  /api/drug/[name]/graph   → subgraph JSON
POST /api/scenario            → run what-if
GET  /api/alternatives/[name] → therapeutic alternatives
GET  /api/manufacturer/[name] → manufacturer profile
```

#### 3E — Streaming Setup

- `streamText()` in route handlers → `ReadableStream` response
- Client uses `useChat()` hook for real-time rendering
- Tool invocations visible in stream (expandable in UI)

### Deliverable
> Full agent pipeline working. All API routes serving data with streaming.

---

## Phase 4 — UI / Command Center (Hours 8–11)

**Goal:** Build the interactive "Drug Shortage Command Center."

### Member 2 (Full-Stack)

#### 4A — Layout

```
app/layout.tsx → Dark theme, sidebar nav, header with global search (Command palette)
```

#### 4B — Dashboard (`/`)

- **Stats Cards**: total shortages, new this week, resolved, critical count
- **Shortage Table**: sortable, filterable; click row → `/investigate?drug=<name>`
- **Top Manufacturers**: bar chart of most-affected manufacturers
- **Recent Events**: latest warning letters, recalls, import alerts

#### 4C — Investigation Page (`/investigate`) — HERO PAGE

1. **Search Bar**: drug name input with autocomplete + "Investigate" button
2. **Root Cause Analysis** (streamed): cause cards with confidence badges, evidence links
3. **Evidence Timeline** (custom React + Tailwind): vertical timeline with event cards, color-coded by event type (shortage=red, recall=orange, warning=yellow, import=purple, news=blue), clickable for details
4. **Dependency Graph** (react-force-graph-2d): interactive node-link diagram, colored by type, click for details
5. **Risk Propagation**: cards showing other at-risk drugs from same manufacturer/plant

#### 4D — Action Center (`/actions`)

Three tabs: **Pharmacy** | **Procurement** | **Clinical**
- Role-specific recommendations from Mitigation Planner
- Priority badges, evidence references
- Export as markdown

#### 4E — Scenario Lab (`/scenario`)

- Scenario type selector + parameter inputs
- Run → impact assessment display
- Before/after comparison, affected drugs list, impact graph

#### 4F — Map View (Stretch)

- react-leaflet with establishment locations
- Color by risk level

### Member 1 (Agentic AI)

#### 4G — Chat Interface

- Slide-out chat panel on investigation page
- `useChat()` → full-context conversation with Claude + all tools
- Follow-up suggestions after investigation completes
- Session history via zustand

#### 4H — Agent Refinement

- Auto query expansion ("amoxicillin" → all formulations, NDCs)
- Tool call visualization in UI
- Error recovery: retry with adjusted parameters

### Deliverable
> Full command center: dashboard, investigation (graph + timeline + root cause + risk), actions, scenario lab, chat.

---

## Phase 5 — Polish, Demo, & Submission (Hours 11–12)

### Both Members

- [ ] E2E walkthrough for 2–3 drugs (e.g., Adderall, Amoxicillin, Vincristine)
- [ ] Pre-compute investigations for demo drugs (`scripts/seed-demo.ts`)
- [ ] Fix loading states, error states, edge cases
- [ ] Write `README.md` (problem, solution, architecture, screenshots, setup, data sources)
- [ ] Record demo video (2–3 min)
- [ ] Clean up code
- [ ] Final commit + submit

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14+ (App Router, TypeScript) | SSR + API routes + React in one |
| AI | Vercel AI SDK (`ai`) + `@ai-sdk/anthropic` | Streaming, tool-use, `useChat()` hook |
| Database | SQLite via `better-sqlite3` + Drizzle ORM | Zero-infra, type-safe, fast |
| Graph Engine | `graphology` + plugins | Lightweight, typed, fast in-memory |
| Graph Viz | `react-force-graph-2d` | WebGL, interactive, handles 1000+ nodes. **Must use `next/dynamic({ ssr: false })`** |
| Charts | `recharts` | 136kB gzipped, tree-shakeable, React-native SVG charts |
| Timeline | Custom React + Tailwind component | Zero extra deps, fastest to build, full design control |
| Map | `react-leaflet` | Free, no API key. **Must use `next/dynamic({ ssr: false })`** |
| UI Kit | shadcn/ui + Tailwind CSS | Beautiful, full control, fast to build |
| HTML Parse | `cheerio` | Server-side DOM parsing |
| Excel Parse | `xlsx` (SheetJS) | No native deps |
| ZIP Parse | `adm-zip` | Simple sync extraction |
| Fuzzy Search | `fuse.js` | Client + server fuzzy matching |
| State | `zustand` | Minimal, no boilerplate |
| Validation | `zod` | Tool inputs, API params, forms |
| Data Refresh | Python (`fetch_all.py`) | Already working, offline utility |

---

## File Structure

```
drug_response_mitigation_copilot/
├── plan.md
├── DRUG_SHORTAGE_IDEA.md
├── README.md
├── LICENSE
│
├── data_access/                    # KEPT AS-IS (Python data fetcher)
│   ├── fetch_all.py
│   ├── README.md
│   └── artifacts/                  # Raw downloaded data (13 files)
│
└── app/                            # Next.js application root
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── drizzle.config.ts
    ├── .env.local                  # ANTHROPIC_API_KEY
    ├── components.json             # shadcn/ui config
    │
    ├── data/
    │   └── drug_shortage.db        # SQLite (generated by ingest)
    │
    ├── scripts/
    │   ├── ingest.ts               # Parse all artifacts → SQLite
    │   └── seed-demo.ts            # Pre-compute demo investigations
    │
    ├── src/
    │   ├── app/                    # Next.js App Router
    │   │   ├── layout.tsx
    │   │   ├── page.tsx            # Dashboard
    │   │   ├── globals.css
    │   │   ├── investigate/
    │   │   │   └── page.tsx
    │   │   ├── actions/
    │   │   │   └── page.tsx
    │   │   ├── scenario/
    │   │   │   └── page.tsx
    │   │   ├── shortages/
    │   │   │   └── page.tsx
    │   │   └── api/
    │   │       ├── investigate/route.ts
    │   │       ├── chat/route.ts
    │   │       ├── shortages/route.ts
    │   │       ├── drug/[name]/
    │   │       │   ├── route.ts
    │   │       │   ├── timeline/route.ts
    │   │       │   └── graph/route.ts
    │   │       ├── scenario/route.ts
    │   │       ├── alternatives/[name]/route.ts
    │   │       └── manufacturer/[name]/route.ts
    │   │
    │   ├── components/
    │   │   ├── ui/                 # shadcn/ui components
    │   │   ├── layout/
    │   │   │   ├── sidebar.tsx
    │   │   │   ├── header.tsx
    │   │   │   └── search-command.tsx
    │   │   ├── dashboard/
    │   │   │   ├── stats-cards.tsx
    │   │   │   ├── shortage-table.tsx
    │   │   │   └── recent-events.tsx
    │   │   ├── investigation/
    │   │   │   ├── search-bar.tsx
    │   │   │   ├── root-cause-panel.tsx
    │   │   │   ├── evidence-timeline.tsx  # custom Tailwind component (no chart lib)
    │   │   │   ├── dependency-graph.tsx   # uses react-force-graph-2d via next/dynamic
    │   │   │   └── risk-propagation.tsx
    │   │   ├── actions/
    │   │   │   ├── pharmacy-actions.tsx
    │   │   │   ├── procurement-actions.tsx
    │   │   │   └── clinical-actions.tsx
    │   │   ├── scenario/
    │   │   │   ├── scenario-form.tsx
    │   │   │   └── impact-display.tsx
    │   │   └── chat/
    │   │       └── chat-panel.tsx
    │   │
    │   └── lib/
    │       ├── db/
    │       │   ├── index.ts        # DB connection singleton
    │       │   ├── schema.ts       # Drizzle table definitions
    │       │   └── queries.ts      # Reusable query functions
    │       ├── ingestion/
    │       │   ├── index.ts        # Run all parsers
    │       │   ├── parse-fda-shortages.ts
    │       │   ├── parse-enforcement.ts
    │       │   ├── parse-warning-letters.ts
    │       │   ├── parse-import-alerts.ts
    │       │   ├── parse-ndc.ts
    │       │   ├── parse-dailymed.ts
    │       │   ├── parse-establishments.ts
    │       │   ├── parse-orange-book.ts
    │       │   ├── parse-ashp.ts
    │       │   ├── parse-gdelt.ts
    │       │   └── parse-cms.ts
    │       ├── graph/
    │       │   ├── builder.ts
    │       │   ├── queries.ts
    │       │   └── serializer.ts
    │       ├── agents/
    │       │   ├── tools.ts
    │       │   ├── prompts.ts
    │       │   ├── investigator.ts
    │       │   ├── risk-propagator.ts
    │       │   ├── mitigation-planner.ts
    │       │   ├── scenario-analyst.ts
    │       │   ├── entity-resolver.ts
    │       │   └── orchestrator.ts
    │       ├── types/
    │       │   └── index.ts
    │       └── utils/
    │           ├── normalize.ts
    │           └── constants.ts
    │
    └── tests/
        ├── parsers.test.ts
        ├── graph.test.ts
        └── agents.test.ts
```

---

## Work Split Per Phase

| Phase | Member 1 (AI Agent Lead) | Member 2 (Full-Stack) |
|-------|--------------------------|------------------------|
| **0 — Bootstrap** | API key, agent skeleton, tool schemas, prompts | Next.js init, deps, Drizzle schema, structure |
| **1 — Ingestion** | Tool implementations, entity resolution | 11 parsers, ingestion script, SQLite |
| **2 — Graph** | Investigation agent, risk propagation agent | graphology builder, queries, serializer |
| **3 — Mitigation** | Mitigation planner, scenario analyst, orchestrator | API routes, streaming |
| **4 — UI** | Chat interface, agent refinement | Dashboard, investigation, actions, scenario |
| **5 — Polish** | Agent tuning, demo caching | UI polish, README, video |

---

## Key Integration Points

Agree on these interfaces in Phase 0 so both members work independently:

1. **Tool Contract** (`lib/agents/tools.ts`): AI lead defines Zod input/output schemas. Full-stack implements `execute` functions.
2. **API ↔ Agent Contract**: Response shape for investigation: `{ causes[], evidence[], riskDrugs[], actions{} }`
3. **Graph JSON Format**: `{ nodes: NodeData[], links: LinkData[] }` matching react-force-graph input.
4. **DB Schema**: `lib/db/schema.ts` is the single source of truth for entity types.

---

## Important Implementation Patterns

### Graph Singleton (avoid rebuilding per request)

The graphology graph should be built once and cached in memory. In Next.js dev mode, hot-reload clears module scope — use `globalThis` to persist:

```typescript
// lib/graph/builder.ts
import Graph from 'graphology';

const globalForGraph = globalThis as unknown as { graph: Graph | undefined };

export function getGraph(): Graph {
  if (!globalForGraph.graph) {
    globalForGraph.graph = buildGraphFromDB(); // load from SQLite, construct edges
  }
  return globalForGraph.graph;
}

export function invalidateGraph(): void {
  globalForGraph.graph = undefined; // call after re-ingestion
}
```

### Artifact Path Resolution

Parsers in `app/src/lib/ingestion/` read from `data_access/artifacts/` which is OUTSIDE the Next.js app directory. Use an absolute path constant:

```typescript
// lib/utils/constants.ts
import path from 'path';

// Resolves from project root (parent of app/), not from app/ itself
export const PROJECT_ROOT = path.resolve(process.cwd(), '..');
export const ARTIFACTS_DIR = path.join(PROJECT_ROOT, 'data_access', 'artifacts');
```

### SSR-Disabled Components Pattern

Three visualization libraries access `window`/`canvas` and CANNOT be server-rendered:

```typescript
// components/investigation/dependency-graph.tsx
import dynamic from 'next/dynamic';

const ForceGraph = dynamic(() => import('react-force-graph-2d'), { ssr: false });
// Same pattern for react-leaflet MapContainer
```

### Vercel AI SDK maxSteps

All agents that use multi-step tool calling MUST set `maxSteps`:

```typescript
const result = streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: INVESTIGATOR_PROMPT,
  messages,
  tools,
  maxSteps: 10, // allows up to 10 tool-call rounds before final response
});
```

---

## Critical Path & Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `xlsx` package stale (4yr old) | Parse issues | Only used in ingestion script, not runtime. Works fine for .xlsx reading. Could use `exceljs` as alternative |
| `react-force-graph-2d` SSR crash | Graph won't render | `next/dynamic` with `{ ssr: false }` |
| `better-sqlite3` native build (Windows) | DB setup fails | Use Node.js LTS (20/22) for prebuilt binaries. Fallback: `sql.js` (WASM, skip Drizzle, use raw SQL) |
| Claude rate limits during demo | Demo breaks | Cache results in DB; pre-compute via `seed-demo.ts` |
| Entity resolution imperfect | Wrong matches | Exact match first + `fuse.js` (threshold 0.3) |
| Graph too large to render | Browser freezes | Limit subgraph depth=2; WebGL renderer |
| HTML parsing breaks | Missing data | Offline-first: parse pre-downloaded artifacts |
| Time crunch | Incomplete UI | Priority: investigation page > dashboard > scenario > map |
| `react-leaflet` SSR mismatch | Map crashes | `next/dynamic({ ssr: false })` |

---

## Quick-Start Commands

```bash
# 1. Refresh data (optional — artifacts already exist)
cd data_access
python fetch_all.py
cd ..

# 2. Setup Next.js app
cd app
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY

# 3. Run data ingestion
npx tsx scripts/ingest.ts

# 4. Start dev server
npm run dev                    # → http://localhost:3000

# 5. (Optional) Cache demo investigations
npx tsx scripts/seed-demo.ts
```

---

## Definition of Done (MVP)

- [ ] User can search for a drug by name (autocomplete)
- [ ] Current shortage status shown with source citations
- [ ] Investigation agent streams root-cause analysis with evidence + confidence
- [ ] Dependency graph renders interactively (click, zoom, hover)
- [ ] Event timeline displayed chronologically
- [ ] ≥3 drug investigations work end-to-end
- [ ] Therapeutic alternatives suggested (Orange Book)
- [ ] Role-specific action recommendations (pharmacy / procurement / clinical)
- [ ] ≥1 scenario simulation works (supplier loss)
- [ ] Chat interface for freeform follow-ups
- [ ] Dashboard with shortage overview stats
- [ ] Demo video (2–3 min)
- [ ] README.md with setup instructions
