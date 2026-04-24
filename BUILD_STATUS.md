# Build Status — Drug Shortage Response & Mitigation Copilot

> Last updated: 2026-04-24
> Stack: Node.js + Express + TypeScript + SQLite (Drizzle) + graphology

---

## Phase 1 — Types & Schema ✅ COMPLETE

### What's done
- Full TypeScript domain types for all 13 data sources (`src/types/domain.ts`)
- Drizzle ORM schema with 12 SQLite tables (`src/db/schema.ts`)
- 17 indexes (lookup + FK indexes for all hot-path agent queries)
- DB singleton with WAL mode enabled (`src/db/index.ts`)

---

## Phase 2 — Parsers & Ingestion ✅ COMPLETE (with known limitations)

### What's done
- 12 parsers covering all data sources (JSON, HTML, ZIP/TSV, ZIP/pipe-delimited, XLSX)
- Entity resolution: dedup drugs by normalized name, merge brand names + active ingredients across sources
- Manufacturer normalization: strips legal suffixes (Inc., LLC, Ltd., Corp.)
- Idempotent ingestion: full wipe + rebuild in a single SQLite transaction every refresh
- FK resolution: all tables linked to `drugs` and `manufacturers` via normalized name matching
- 130,000+ rows loaded across 11 tables

### Current row counts
| Table | Rows | FK coverage |
|---|---|---|
| drugs | 7,648 | — |
| manufacturers | 10,495 | — |
| ndcs | 25,000 | 100% drug_id |
| shortage_records | 263 | 100% drug_id |
| recall_events | 17,583 | 100% mfr_id · 69% drug_id |
| warning_letters | 1,000 | 100% mfr_id |
| import_alerts | 100 | — (see limitations) |
| establishments | 10,161 | 100% mfr_id |
| orange_book_entries | 48,083 | 100% drug_id |
| spl_labels | 10,000 | — |
| news_signals | 35 | — |

### Known limitations — none block Phase 5 agents (agents query SQL directly)

**1. Recalls → Drug: 69% linked (31% unresolved)**
- Root cause: recall product text uses clinical names like "Semaglutide Injection 10 mg/4 mL" while the drug table key is just "Semaglutide". First-significant-word fallback catches most but not all.
- Blocking Phase 5? No — agents search recalls by firm name and product text via SQL. 69% graph linkage is sufficient.
- Solvable later (~45 min): fuse.js second-pass over recall product text against drug/ingredient names.

**2. ASHP Drug Shortages: 0 records (Cloudflare-blocked)**
- ASHP is behind Cloudflare WAF. Free proxy rotation fails too.
- Blocking Phase 5? No — FDA's 263 records are sufficient for prototype. ASHP adds clinical depth, not a new investigation capability.
- Solvable later (~1–2h): Playwright headless browser OR find ASHP's internal XHR endpoint via browser devtools OR ASHP institutional API partnership.
- Note: ASHP is THE primary shortage reference for hospital pharmacists. Required for production, not for demo.

**3. Import alerts: firm name empty (FDA source limitation)**
- FDA's import alert search endpoint returns alert numbers + charge text but no per-firm details.
- Blocking Phase 5? No — agents can text-search import alerts by charge description.
- Solvable later (~1h): fetch each of the 100 detail page URLs we already have, parse firm names with cheerio. ~25 seconds of network time.

**4. NDC cap at 25,000 (openFDA API limit)**
- openFDA enforces `skip <= 25,000` without an API key. Full NDC dataset is ~600k records.
- Blocking Phase 5? No — 25,000 NDCs covers the major drugs. Obscure formulations may be missing.
- Solvable later (~30 min): paginate using date-range `search=` queries (e.g. `marketing_start_date:[19000101+TO+20100101]`) to get all slices. Free openFDA API key also raises rate limits.

**5. Warning letter URLs: ✅ SOLVED via Playwright**
- FDA's JSON/XML datatables endpoints are WAF-blocked. HTML pages render via JavaScript DataTables so static parsers get only ~10 rows. Solved by running a Playwright headless browser that navigates the live page, sets 100 rows/page, and paginates 35 pages.
- Result: **3,429 direct letter URLs collected** (more than the XLSX's 1,000-row cap). All 1,000 XLSX records now have direct links like `https://www.fda.gov/.../warning-letters/novo-nordisk-inc-716495-09092025`.
- Script: `npm run collect-warning-letters` — runtime ~93 seconds. Run once; stored in `artifacts/fda_warning_letter_urls.json`. Parser auto-reads it on next ingest.
- Note: XLSX is capped at 1,000 rows. Future work: also ingest the extra 2,429 warning letters from the Playwright artifact.

**6. DailyMed SPL labels: no drug_id linkage (deferred — not needed for Phase 5)**
- SPL labels have labeler extracted but no drug_id FK. Labeler chain (labeler → manufacturer) provides indirect connectivity.
- Blocking Phase 5? No — agents text-search titles (`WHERE title LIKE '%AMOXICILLIN%'`). drug_id FK just makes it a cleaner JOIN vs a LIKE query.
- What it would enable when built: `getDrugDetails` returning the official prescribing label with last-updated date; `drug → spl_label → labeler → manufacturer` graph edges; label change timeline.
- Solvable two ways: (a) extract ingredient from `(INGREDIENT)` bracket in title, normalize, match to drugs table — fast, ~70-80% match, zero API calls; (b) call DailyMed `/services/v2/spls/{setId}/ndcs.json` for all 10,000 labels — perfect linkage but ~33 min runtime. Deferred to post-Phase 7.

**3. Import alerts: firm name (deferred — Playwright can solve, rate-limited during dev)**
- Detail pages (`accessdata.fda.gov/CMS_IA/importalert_XXXX.html`) are static HTML, no JS rendering. Axios + cheerio would work fine — no Playwright needed.
- Currently blocked: FDA's `accessdata.fda.gov` rate-limits our dev IP from repeated testing. Clears after ~15 min.
- Script to write: fetch all 100 detail URLs stored in `import_alerts.url`, parse firm table, save `artifacts/fda_import_alert_firms.json`, re-ingest to populate manufacturer_id and connect graph edges.
- Blocking Phase 5? No — agents text-search by charge description. Graph connectivity (import_alert → manufacturer) is a nice-to-have for traversal, not essential for SQL-based agent tools.

---

## Phase 3 — Refresh Pipeline ✅ COMPLETE

### What's done
- On server startup: if DB is empty, seeds from existing artifacts (fast, no network)
- `npm run refresh`: full pipeline (fetch all 13 sources + ingest) — designed for daily cron job
- `npm run ingest`: parse existing artifacts → DB only (no network)
- `POST /api/refresh`: manual HTTP trigger
- `GET /api/refresh/status`: last refresh stats + running flag
- Concurrent-refresh guard (409 if already running)
- `DISABLE_AUTO_REFRESH=true` env flag for dev/testing

### Cron setup (manual operator step)
```bash
# Runs at 2am daily
0 2 * * * cd /path/to/backend && npm run refresh >> /tmp/drug-shortage-refresh.log 2>&1
```

---

## Phase 4 — Knowledge Graph ✅ COMPLETE (with known limitations)

### What's done
- In-memory graphology graph built from SQLite at first request (~860ms)
- 76,825 nodes · 108,680 edges across 9 types each
- Singleton cached via `globalThis` — survives ts-node-dev hot reloads
- Auto-invalidated after every ingestion cycle
- Ingredient inference for shortage-origin drugs (connects them to the wider graph)

### Graph topology
```
Nodes:  drug=7,648  ndc=24,639  manufacturer=10,495  establishment=10,161
        ingredient=4,936  recall=17,583  warning_letter=1,000
        shortage=263  import_alert=100

Edges:  labeled_by=24,659   has_ndc=24,640    contains=18,225
        issued_recall=17,583  recalled_as=12,149  operates=10,161
        received=1,000        in_shortage=263
```

### API endpoints live
| Endpoint | Description |
|---|---|
| `GET /api/graph/stats` | Node/edge counts by type + build time |
| `GET /api/graph/drug/:name?depth=N` | Supply-chain subgraph for a drug (depth 1–4) |
| `GET /api/graph/manufacturer/:name/risk` | Risk cluster: drugs, plants, warnings, recalls |
| `GET /api/graph/node/:id?depth=N` | Generic subgraph from any node ID |

### Known limitations (none block Phase 5)
- **100 import alert nodes isolated** — no manufacturer edges (Phase 2 limitation #3). Reachable via SQL, not graph walk.
- **No drug → SPL label edges** — labeler chain exists but drug-level wiring needs DailyMed NDC API.
- **Drug entity resolution imperfect** — shortage-origin drugs don't always merge with NDC-origin drugs. Ingredient inference bridges most gaps.

---

## News Sources — Current & Planned

### GDELT DOC API ✅ Already integrated
- Free, no API key required
- Searches global news corpus using keyword queries (`"drug shortage" OR "pharmaceutical shortage"`)
- Returns up to 250 articles per query with title, URL, domain, date, language, source country
- Currently storing 35 articles (live result count — varies by query window)
- Limitation: historical bias, not always real-time. Best for background context, not breaking news.
- Stored in: `news_signals` table, queried via `searchNews` agent tool in Phase 5

### Tavily Search API ❌ Not integrated (planned for Phase 5/6)
- **What it is**: real-time AI-optimised web search API, purpose-built for LangChain agents
- **Why add it**: GDELT gives historical corpus matches; Tavily gives current web search results. For "why is Amoxicillin in shortage right now?", Tavily would surface today's news articles, FDA press releases, and manufacturer statements that GDELT may not yet index.
- **Cost**: ~$50/month for 1,000 searches. For a single-user prototype, free tier (1,000 req/month) is sufficient.
- **Integration**: LangChain has a built-in `TavilySearchResults` tool. Drop-in addition to the agent's tool list in Phase 5.
- **Requires**: `TAVILY_API_KEY` env var. Register at tavily.com.
- **Planned use**: `searchCurrentNews` tool in InvestigationAgent — called when GDELT results are sparse or stale.

### Playwright MCP ❌ Not integrated (planned for Phase 6)
- **What it is**: Microsoft's [Playwright MCP server](https://github.com/microsoft/playwright-mcp) — gives agents a real headless browser as a tool. Tools include `browser_navigate`, `browser_click`, `browser_snapshot`, `browser_fill`, `browser_select_option`.
- **Why add it to the agent**: When the investigation agent finds a warning letter, recall, or import alert in the DB, it can navigate to the actual FDA page, read the rendered content, and cite the specific document. The agent literally browses FDA.gov during the investigation — visible in the UI as the "agent drives the browser" moment from VISION.md.
- **Setup**: Run as a sidecar MCP server alongside the backend. Already available via npm: `npx @playwright/mcp`. Configure in `.mcp.json` or Claude Code settings.
- **Demo value**: Extremely high. Watching the agent open a browser, navigate to FDA, read the violation letter, and cite it is unique to Playwright MCP agents.
- **Planned use in Phase 6**: `InvestigationAgent` uses `browser_navigate` when it needs to verify or enrich a data point it found in the DB. E.g., reading the full text of a warning letter or checking if an import alert was recently updated.
- **Note**: Playwright is already installed as a dependency (`playwright ^1.59.1`) for the data collection script. MCP setup is a configuration step, not a new install.

### Recommended news strategy for Phase 5
```
searchNews(query)
  1. Query local news_signals table (GDELT — historical, offline, always available)
  2. If results < 3 OR query is time-sensitive → call Tavily for live web results
  3. Merge, deduplicate by URL, return combined list
```

---

## Phase 5 — Agent Tools ❌ NOT STARTED

### What needs to be built
- LangChain `DynamicStructuredTool` definitions with Zod input schemas
- Execute functions backed by SQLite queries and graphology traversal
- Dependencies to install: `@langchain/core @langchain/anthropic langchain langgraph @langchain/community`

### Planned tools
| Tool | Input | Backed by |
|---|---|---|
| `searchDrugs` | `{ query }` | SQLite LIKE + fuse.js fuzzy |
| `searchShortages` | `{ drugName }` | `shortage_records` table |
| `searchRecalls` | `{ query, by: "drug"\|"manufacturer" }` | `recall_events` table |
| `searchWarningLetters` | `{ query }` | `warning_letters` table |
| `searchImportAlerts` | `{ query }` | `import_alerts` table |
| `getDrugDetails` | `{ identifier }` | JOIN across drugs/ndcs/shortages/labels |
| `getManufacturerProfile` | `{ name }` | JOIN across mfrs/establishments/warnings/imports |
| `getTherapeuticAlternatives` | `{ drugName }` | `orange_book_entries` TE codes (A-rated) |
| `getSupplyChainGraph` | `{ drugName, depth? }` | graphology traversal |
| `searchNews` | `{ query }` | GDELT (`news_signals`) + Tavily (live) |
| `getTimeline` | `{ drugName }` | Multi-table merge sorted by date |

---

## Phase 6 — LangGraph Agent Pipeline ❌ NOT STARTED

### What needs to be built
- LangGraph `StateGraph` with 5 nodes
- Shared `InvestigationState` type
- Model: `claude-sonnet-4-6` via `@langchain/anthropic`

### Planned nodes
| Node | Role |
|---|---|
| `EntityResolver` | Fuzzy-match user input → canonical drug entity |
| `InvestigationAgent` | Root-cause analysis via multi-step tool-use (`maxSteps: 10`) |
| `RiskPropagationAgent` | What else is at risk from same manufacturer/plant/ingredient |
| `MitigationPlannerAgent` | Role-specific actions (pharmacy 24h · procurement 7d · clinical ongoing) |
| `ScenarioAnalystAgent` | Conditional: "what if plant X shuts down?" — graph traversal simulation |

### Key architecture decision
Every agent tool call emits a structured SSE event alongside the text stream. The frontend globe and graph panel animate from these events — the agent *drives* the UI in real time, not just returns a final result. See `VISION.md` for full event protocol design.

---

## Phase 7 — API Routes & SSE Streaming ❌ NOT STARTED

### What needs to be built
| Method | Route | Description |
|---|---|---|
| `POST` | `/api/investigate` | Body: `{ drug, scenarioParams? }` → SSE stream of agent events |
| `GET` | `/api/drug/:name` | Drug detail + NDCs + shortages + labels |
| `GET` | `/api/drug/:name/timeline` | All events sorted chronologically |
| `GET` | `/api/alternatives/:name` | Therapeutic alternatives (Orange Book AB-rated) |
| `GET` | `/api/manufacturer/:name` | Manufacturer profile + establishments + regulatory history |
| `POST` | `/api/scenario` | Standalone what-if simulation |

### Already live
- `GET /api/shortages`
- `GET /api/graph/stats`, `/drug/:name`, `/manufacturer/:name/risk`, `/node/:id`
- `POST /api/refresh` + `GET /api/refresh/status`
- `GET /health`

---

## Data Limitations — Deferred to Post-Prototype

All 6 known data limitations are solvable but **none block Phase 5-7 prototype work**. Deferred.

| # | Limitation | Effort to fix | Priority |
|---|---|---|---|
| 1 | NDC cap at 25k records | ~30 min (date-range query slicing) | Medium |
| 2 | Recall → drug gap (31%) | ~45 min (fuse.js second-pass) | Medium |
| 3 | Import alert firm names missing | ~1h (fetch 100 detail pages) | Low |
| 4 | Warning letter direct URLs | ✅ SOLVED — Playwright script collects 3,429 URLs in ~93s | Done |
| 5 | SPL → drug linkage | ~2h (DailyMed NDC API chain) | Low |
| 6 | ASHP blocked by Cloudflare | ~1–2h (Playwright or paid proxy) | High for production |

---

## Summary

| Phase | Status | Completion |
|---|---|---|
| 1 — Types & Schema | ✅ Complete | 100% |
| 2 — Parsers & Ingestion | ✅ Complete | ~85% (data limitations deferred) |
| 3 — Refresh Pipeline | ✅ Complete | 100% |
| 4 — Knowledge Graph | ✅ Complete | ~90% (import alerts isolated) |
| 5 — Agent Tools | ❌ Not started | 0% |
| 6 — LangGraph Agents | ❌ Not started | 0% |
| 7 — API + SSE | ❌ Not started | 0% |

### What works right now
- Server starts, seeds DB from artifacts if empty, all API routes respond
- `npm run refresh` fetches + ingests all 13 sources (130k rows in ~6s parse time)
- 76k-node knowledge graph with supply-chain traversal live
- `GET /api/graph/drug/Amoxicillin?depth=2` → 107-node subgraph with colors/sizes ready for `react-force-graph-2d`
- `GET /api/graph/manufacturer/Cohance/risk` → 25 drugs + 6 establishments + 1 warning letter

### Next step
**Phase 5** — LangChain agent tools wrapping the SQLite + graph layer. The data is solid. Build the tools, then wire the LangGraph pipeline, then expose via SSE.
