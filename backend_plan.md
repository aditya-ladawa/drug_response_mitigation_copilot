# Backend Build Plan — Drug Shortage Response & Mitigation Copilot

## Context

We own the backend, agents, and data pipeline. The frontend (Next.js) is handled by a teammate.
Stack: **Express + TypeScript + LangGraph JS + LangChain JS + SQLite (Drizzle) + graphology**.

Data must stay fresh — a scheduled refresh cycle fetches all 13 sources, parses them, and updates
the SQLite knowledge base automatically. Agents always read from live DB, never stale artifacts.

```
[Scheduled / Manual Refresh]  →  Fetch 13 sources  →  Parse  →  SQLite  →  Invalidate graph cache
[User selects drug]            →  POST /api/investigate  →  LangGraph pipeline  →  SSE stream  →  Frontend
```

---

## Folder Structure (additions to existing backend/)

```
backend/
├── src/
│   ├── index.ts                          ← add cron scheduler here
│   ├── routes/
│   │   ├── dataSources.ts                ← existing
│   │   ├── investigate.ts                ← NEW: POST /api/investigate (SSE)
│   │   ├── shortages.ts                  ← NEW: GET /api/shortages
│   │   ├── drug.ts                       ← NEW: GET /api/drug/:name + subresources
│   │   ├── scenario.ts                   ← NEW: POST /api/scenario
│   │   └── refresh.ts                    ← NEW: POST /api/refresh + GET /api/refresh/status
│   ├── services/
│   │   ├── dataAccess/                   ← existing (fetcher.ts, sources.ts, index.ts)
│   │   ├── ingestion/
│   │   │   ├── index.ts                  ← orchestrates all parsers → SQLite
│   │   │   ├── parsers/
│   │   │   │   ├── parse-fda-shortages.ts
│   │   │   │   ├── parse-enforcement.ts
│   │   │   │   ├── parse-warning-letters.ts
│   │   │   │   ├── parse-import-alerts.ts
│   │   │   │   ├── parse-ndc.ts
│   │   │   │   ├── parse-dailymed.ts
│   │   │   │   ├── parse-establishments.ts
│   │   │   │   ├── parse-orange-book.ts
│   │   │   │   ├── parse-ashp.ts
│   │   │   │   ├── parse-gdelt.ts
│   │   │   │   └── parse-cms.ts
│   │   │   └── entity-resolver.ts        ← normalize drug/manufacturer names
│   │   ├── graph/
│   │   │   ├── builder.ts                ← SQLite → graphology in-memory graph
│   │   │   ├── queries.ts                ← subgraph, neighbors, risk cluster
│   │   │   └── serializer.ts             ← → { nodes[], links[] } for frontend
│   │   └── agents/
│   │       ├── tools.ts                  ← LangChain tool definitions (Zod schemas)
│   │       ├── prompts.ts                ← system prompts per agent role
│   │       ├── nodes/
│   │       │   ├── entity-resolver.ts
│   │       │   ├── investigator.ts
│   │       │   ├── risk-propagator.ts
│   │       │   ├── mitigation-planner.ts
│   │       │   └── scenario-analyst.ts
│   │       └── orchestrator.ts           ← LangGraph StateGraph definition
│   ├── db/
│   │   ├── index.ts                      ← better-sqlite3 singleton
│   │   ├── schema.ts                     ← Drizzle table definitions
│   │   └── queries.ts                    ← reusable query functions
│   └── types/
│       ├── index.ts                      ← existing SourceResult
│       └── domain.ts                     ← NEW: all domain types
├── data/
│   └── drug_shortage.db                  ← SQLite (auto-created by ingest)
└── artifacts/                            ← existing (refreshed by scheduler)
```

---

## Phase 1 — Types & Schema  *(~2h)*

**Goal:** Define the complete TypeScript type system and Drizzle SQLite schema first.
Everything else depends on this contract.

### 1A — Domain Types (`src/types/domain.ts`)

Based on actual artifact data shapes already validated:

```typescript
interface RecallEvent {
  recallNumber: string; product: string; reason: string;
  classification: string; recallingFirm: string; recallDate: string;
  status: string; city: string; state: string; country: string; codeInfo: string;
}
interface NDCRecord {
  productNdc: string; genericName: string; brandName: string; labelerName: string;
  dosageForm: string; route: string[]; activeIngredients: { name: string; strength: string }[];
  pharmClass: string[]; marketingStartDate: string; productType: string;
}
interface ShortageRecord {
  drugName: string; status: string; source: 'FDA' | 'ASHP'; url: string; resolvedDate?: string;
}
interface WarningLetter {
  company: string; subject: string; issueDate: string; postedDate: string;
  issuingOffice: string; letterId: string; url: string;
}
interface ImportAlert { alertNumber: string; product: string; firm: string; charge: string; url: string; }
interface Establishment { feiNumber: string; name: string; address: string; city: string; state: string; country: string; operations: string; }
interface OrangeBookEntry { ingredient: string; tradeName: string; applicant: string; teCode: string; type: string; rldFlag: string; }
interface SPLLabel { setId: string; title: string; publishedDate: string; splVersion: number; }
interface NewsSignal { title: string; url: string; seenDate: string; domain: string; language: string; sourcecountry: string; }
```

### 1B — Drizzle Schema (`src/db/schema.ts`)

```
drugs             { id, genericName, brandNames(JSON), activeIngredients(JSON), therapeuticClass }
ndcs              { id, ndcCode, drugId(FK), labeler, dosageForm, route, packageDescription }
manufacturers     { id, name, normalizedName }
establishments    { id, feiNumber, name, address, city, state, country, operations, manufacturerId(FK) }
shortageRecords   { id, drugId(FK), status, startDate, endDate?, source, sourceUrl }
recallEvents      { id, product, reason, classification, recallDate, firm, drugId(FK), manufacturerId(FK) }
warningLetters    { id, company, subject, issueDate, url, letterId, manufacturerId(FK) }
importAlerts      { id, alertNumber, product, firm, country, charge, manufacturerId(FK) }
orangeBookEntries { id, ingredient, tradeName, applicant, teCode, type, drugId(FK) }
splLabels         { id, setId, title, effectiveDate, labeler }
newsSignals       { id, title, url, publishDate, domain, sourcecountry }
refreshLog        { id, startedAt, completedAt, status, sourcesOk, sourcesFailed, notes }
```

**New deps:**
```bash
npm i better-sqlite3 drizzle-orm
npm i -D drizzle-kit @types/better-sqlite3
```

---

## Phase 2 — Parsers & Ingestion  *(~3h, three groups run in parallel)*

**Goal:** Parse all 13 artifacts into typed domain objects and insert into SQLite.

### Group A — JSON parsers (native JSON.parse, fastest)

| Parser | Source file | Output |
|--------|-------------|--------|
| `parse-enforcement.ts` | `openfda_drug_enforcement.json` | `RecallEvent[]` |
| `parse-ndc.ts` | `openfda_ndc.json` | `NDCRecord[]` |
| `parse-dailymed.ts` | `dailymed_spls.json` | `SPLLabel[]` |
| `parse-gdelt.ts` | `gdelt_doc_api.json` | `NewsSignal[]` |
| `parse-cms.ts` | both CMS files | usage records |

### Group B — HTML parsers (cheerio)

| Parser | Source file | Selector target |
|--------|-------------|-----------------|
| `parse-fda-shortages.ts` | `fda_drug_shortages.html` | `#cont` table (current) + `#dis` (discontinued) |
| `parse-warning-letters.ts` | `fda_warning_letters_page.html` | `table#datatable` rows, `<time>` elements |
| `parse-import-alerts.ts` | `fda_import_alerts.html` | `.content-block-item.result` elements |
| `parse-ashp.ts` | `ashp_drug_shortages.html` | nav links → fetch `/drug-shortages-list?page=CurrentShortages` |

### Group C — File parsers (adm-zip + xlsx + csv-parse)

| Parser | Source file | Format |
|--------|-------------|--------|
| `parse-establishments.ts` | `fda_drug_establishments.zip` → `drls_reg.txt` | TSV |
| `parse-orange-book.ts` | `fda_orange_book.zip` → `products.txt` | pipe `\|` delimited |
| `parse-warning-letters-xlsx.ts` | `fda_warning_letters_xlsx.xlsx` | Excel (more complete than HTML) |

### 2D — Entity Resolution (`src/services/ingestion/entity-resolver.ts`)

- Normalize manufacturer names: uppercase, strip "Inc.", "LLC", "Ltd.", "Corp."
- Map NDC `labelerName` → `manufacturers` table (create if new)
- Fuzzy-link drug names across sources with `fuse.js` (threshold 0.3)
- Deduplicate `drugs` table across FDA, ASHP, openFDA, DailyMed

### 2E — Ingestion Orchestrator (`src/services/ingestion/index.ts`)

```typescript
export async function runIngestion(): Promise<IngestionResult> {
  // 1. Run all parsers against artifacts/
  // 2. Entity resolution
  // 3. Upsert all records into SQLite via Drizzle
  // 4. Write entry to refreshLog
  // 5. Invalidate in-memory graph cache
}
```

**New deps:**
```bash
npm i cheerio xlsx adm-zip csv-parse fuse.js
npm i -D @types/adm-zip
```

---

## Phase 3 — Refresh Pipeline  *(~1h)*

**Goal:** Data stays fresh while the server is running. No external scheduler — a plain
`setInterval` in the server entry point fires every 15 minutes. Also manually triggerable
via API so the frontend can force a refresh.

### 3A — Auto refresh on server start (`src/index.ts`)

```typescript
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Run once on boot, then every 15 min
async function refresh() {
  await runChecks();      // fetch all 13 sources → artifacts/
  await runIngestion();   // parse → SQLite, invalidate graph cache
}

refresh();
setInterval(refresh, REFRESH_INTERVAL_MS);
```

No extra dependency — uses native Node.js `setInterval`.

### 3B — Manual refresh endpoint (`src/routes/refresh.ts`)

```
POST /api/refresh
  → runs runChecks() + runIngestion() immediately
  → streams SSE progress events (source name, ok/fail, done)
  → final: { sourcesOk, sourcesFailed, durationMs }

GET /api/refresh/status
  → returns latest refreshLog row
  → { lastRefreshedAt, sourcesOk, sourcesFailed, status }
```

---

## Phase 4 — Knowledge Graph  *(~2h)*

**Goal:** In-memory graphology graph built from SQLite, cached as a global singleton,
invalidated whenever ingestion runs.

### 4A — Builder (`src/services/graph/builder.ts`)

Node types: `drug`, `ndc`, `manufacturer`, `establishment`, `shortage`, `recall`, `warning_letter`, `import_alert`, `news`

Edge types:
```
drug --has_ndc-->             ndc
ndc  --labeled_by-->          manufacturer
manufacturer --operates-->    establishment
establishment --received-->   warning_letter
manufacturer --subject_of-->  import_alert
drug --in_shortage-->         shortage
drug --recalled_as-->         recall
drug --therapeutic_equiv-->   drug
drug --same_ingredient-->     drug
drug --mentioned_in-->        news
```

Singleton pattern (survives hot-reload in dev):
```typescript
const g = globalThis as { _graph?: Graph };
export const getGraph  = (): Graph => { if (!g._graph) g._graph = buildFromDB(); return g._graph; };
export const invalidateGraph = (): void => { g._graph = undefined; };
```

### 4B — Queries (`src/services/graph/queries.ts`)

```typescript
getSubgraph(nodeId: string, depth: number): SerializedGraph
getNeighbors(nodeId: string, edgeType?: string): Node[]
getRiskCluster(manufacturerId: string): { drugs, establishments, alerts }
findPaths(fromId: string, toId: string): Path[]
getSupplyChainGraph(drugName: string, depth?: number): SerializedGraph
```

### 4C — Serializer (`src/services/graph/serializer.ts`)

Output shape matches `react-force-graph-2d`:
```typescript
serialize(graph: Graph): { nodes: NodeData[], links: LinkData[] }
// Node color by type, size by risk level
```

**New deps:**
```bash
npm i graphology graphology-traversal graphology-shortest-path
```

---

## Phase 5 — Agent Tools  *(~2h, all tools parallelisable)*

**Goal:** LangChain `DynamicStructuredTool` definitions backed by SQLite + graphology.
Every tool has a Zod input schema and an execute function.

| Tool | Input | Output | Backed by |
|------|-------|--------|-----------|
| `searchDrugs` | `{ query }` | `Drug[]` | SQLite + fuse.js |
| `searchShortages` | `{ drugName }` | `ShortageRecord[]` | shortageRecords |
| `searchRecalls` | `{ query, by }` | `RecallEvent[]` | recallEvents |
| `searchWarningLetters` | `{ query }` | `WarningLetter[]` | warningLetters |
| `searchImportAlerts` | `{ query }` | `ImportAlert[]` | importAlerts |
| `getDrugDetails` | `{ identifier }` | `Drug & { ndcs, labels, shortages }` | JOIN query |
| `getManufacturerProfile` | `{ name }` | `Manufacturer & { establishments, warnings, alerts }` | JOIN query |
| `getTherapeuticAlternatives` | `{ drugName }` | `Drug[]` | orangeBookEntries teCode |
| `getSupplyChainGraph` | `{ drugName, depth? }` | `SerializedGraph` | graphology |
| `searchNews` | `{ query }` | `NewsSignal[]` | newsSignals |
| `getTimeline` | `{ drugName }` | `TimelineEvent[]` | multi-table merge + sort by date |

**New deps:**
```bash
npm i @langchain/core @langchain/anthropic langchain langgraph zod
```

---

## Phase 6 — LangGraph Agent Pipeline  *(~4h)*

**Goal:** Multi-node StateGraph where each node is a specialized Claude-powered agent.
Model: `claude-sonnet-4-6` via `@langchain/anthropic`.

### 6A — Shared State

```typescript
interface InvestigationState {
  query: string
  drug: Drug | null
  shortages: ShortageRecord[]
  recalls: RecallEvent[]
  warningLetters: WarningLetter[]
  importAlerts: ImportAlert[]
  news: NewsSignal[]
  causes: RankedCause[]           // { cause, confidence: 'HIGH'|'MEDIUM'|'LOW', evidence[], sourceLinks[] }
  riskDrugs: AtRiskDrug[]         // { drugName, risk, reason }
  actions: StakeholderActions     // { pharmacy[], procurement[], clinical[] }
  scenarioParams?: ScenarioParams // present only for scenario requests
  scenarioResult?: ImpactAssessment
  streamEvents: StreamEvent[]     // accumulated for SSE
  error?: string
}
```

### 6B — Node: EntityResolver

- Fuzzy-matches `query` → canonical `Drug` via `searchDrugs` tool
- If no match → sets `error`, graph ends early

### 6C — Node: InvestigationAgent

- Tool-use loop, `maxSteps: 10`
- Tools: `searchShortages`, `getDrugDetails`, `searchRecalls`, `searchWarningLetters`, `searchImportAlerts`, `searchNews`
- Outputs: `causes[]` ranked HIGH/MED/LOW with evidence citations
- Each cause streams as SSE `cause_found` event

### 6D — Node: RiskPropagationAgent

- Uses `getSupplyChainGraph`, `getManufacturerProfile`
- Walks graph from implicated manufacturers → finds co-exposed drugs
- Outputs: `riskDrugs[]` with reasoning

### 6E — Node: MitigationPlannerAgent

- Uses `getTherapeuticAlternatives`, `getManufacturerProfile`
- Outputs: `actions.pharmacy[]`, `actions.procurement[]`, `actions.clinical[]`

### 6F — Node: ScenarioAnalystAgent *(conditional — only if `scenarioParams` present)*

- Graph traversal simulation of the what-if scenario
- Outputs: `scenarioResult` with before/after impact

### 6G — Orchestrator (`src/services/agents/orchestrator.ts`)

```typescript
const pipeline = new StateGraph(InvestigationState)
  .addNode('entityResolver',    entityResolverNode)
  .addNode('investigator',      investigatorNode)
  .addNode('riskPropagator',    riskPropagatorNode)
  .addNode('mitigationPlanner', mitigationPlannerNode)
  .addNode('scenarioAnalyst',   scenarioAnalystNode)
  .addEdge(START,              'entityResolver')
  .addEdge('entityResolver',   'investigator')
  .addEdge('investigator',     'riskPropagator')
  .addEdge('riskPropagator',   'mitigationPlanner')
  .addConditionalEdges('mitigationPlanner', hasScenarioParams,
    { yes: 'scenarioAnalyst', no: END })
  .compile();
```

---

## Phase 7 — API Routes & SSE Streaming  *(~2h)*

**Goal:** Express routes the frontend teammate calls.

### Route Table

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/investigate` | `{ drug, scenarioParams? }` → SSE stream |
| `GET` | `/api/shortages` | All current shortages from DB |
| `GET` | `/api/drug/:name` | Drug detail + NDCs + labels + shortages |
| `GET` | `/api/drug/:name/timeline` | Chronological events (all tables, sorted by date) |
| `GET` | `/api/drug/:name/graph` | Serialized subgraph JSON |
| `GET` | `/api/alternatives/:name` | Therapeutic equivalents (Orange Book) |
| `GET` | `/api/manufacturer/:name` | Manufacturer profile + establishments |
| `POST` | `/api/scenario` | Standalone what-if simulation |
| `POST` | `/api/refresh` | Manual refresh trigger (SSE progress) |
| `GET` | `/api/refresh/status` | Last refresh stats |
| `GET` | `/health` | Existing |

### SSE Event Protocol (`/api/investigate`)

```
event: entity_resolved
data: { "drug": "Amoxicillin", "ndcs": 12, "manufacturers": 3 }

event: investigation_step
data: { "step": 1, "tool": "searchShortages", "found": 4 }

event: cause_found
data: { "cause": "...", "confidence": "HIGH", "evidence": [...] }

event: risk_drugs
data: { "drugs": [{ "name": "...", "risk": "HIGH", "reason": "..." }] }

event: actions
data: { "pharmacy": [...], "procurement": [...], "clinical": [...] }

event: scenario_result
data: { "impactedDrugs": [...], "severityScore": 0.8 }

event: done
data: { "durationMs": 4200 }

event: error
data: { "message": "Drug not found: ..." }
```

---

## Full Dependency Install

```bash
cd backend

# Phase 1 — DB
npm i better-sqlite3 drizzle-orm
npm i -D drizzle-kit @types/better-sqlite3

# Phase 2 — Parsers
npm i cheerio xlsx adm-zip csv-parse fuse.js
npm i -D @types/adm-zip

# Phase 4 — Graph
npm i graphology graphology-traversal graphology-shortest-path

# Phase 5+6 — Agents
npm i @langchain/core @langchain/anthropic langchain langgraph zod
```

---

## Build Order (Divide & Conquer)

```
Phase 1 ── Types & Schema                      ← start here, unblocks everything
    │
    ├── Phase 2A ── JSON parsers  ──┐
    ├── Phase 2B ── HTML parsers  ──┼── parallel ──→ Phase 2E: Ingestion orchestrator
    └── Phase 2C ── File parsers  ──┘
                        │
           ┌────────────┴────────────┐
      Phase 3                   Phase 4
  Refresh pipeline           Knowledge graph
  (cron + /api/refresh)      (graphology builder)
                                    │
                               Phase 5
                             Agent tools
                            (LangChain tools)
                                    │
                               Phase 6
                           LangGraph pipeline
                          (StateGraph + nodes)
                                    │
                               Phase 7
                           API routes + SSE
```

---

## Verification Checklist

```bash
# Phase 1-2: DB populated
npx tsx src/services/ingestion/index.ts
sqlite3 data/drug_shortage.db "SELECT count(*) FROM drugs;"

# Phase 3: Manual refresh
curl -N -X POST http://localhost:3001/api/refresh   # watch SSE stream

# Phase 4: Graph stats
curl http://localhost:3001/api/graph/stats          # node/edge counts

# Phase 5: Tool smoke test
# Unit: call searchDrugs({ query: "amoxicillin" }) directly

# Phase 6-7: Full E2E
curl -N -X POST http://localhost:3001/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"drug":"amoxicillin"}'
# Expect 7 SSE events in order: entity_resolved → investigation_step(s) →
#   cause_found(s) → risk_drugs → actions → done
```
