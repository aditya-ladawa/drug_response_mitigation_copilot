# Drug Shortage Response & Mitigation Copilot

AI-powered supply chain intelligence tool for pharmacy, procurement, and clinical teams.
Investigates drug shortages, traces root causes, surfaces regulatory history, and recommends
role-specific mitigation actions — driven by a live knowledge graph of 13 FDA data sources.

---

## If Darshan (frontend):

### Workflow

```bash
# 1. Pull latest
git pull origin adi_dev

# 2. Install & run backend (Terminal 1) — port 3001
cd backend && npm install && npm run dev

# 3. Install & run frontend (Terminal 2) — port 3000
cd frontend && npm install && npm run dev

# 4. Open http://localhost:3000
#    When done, commit your changes and push to adi_dev:
git add .
git commit -m "frontend: <what you built>"
git push origin adi_dev
```

The backend auto-seeds the SQLite DB from pre-fetched artifacts on first start (~6s). No extra step needed.

---

### Layout we want

```
+----------------------------------------------------------+
|  Drug Shortage Copilot                      [dark theme]  |
+----------------------------------------------------------+
|                                                          |
|   Investigate a drug shortage:                           |
|   +------------------------------------------+  [Go]    |
|   |  e.g. Amoxicillin, Adderall, Vincristine |           |
|   +------------------------------------------+           |
|                                                          |
+-------------------------+--------------------------------+
|                         |                                |
|   3D GLOBE              |   KNOWLEDGE GRAPH PANEL        |
|                         |                                |
|   (react-globe.gl)      |   (react-force-graph-2d)       |
|                         |                                |
|   - Pins = mfr plants   |   - Nodes: drug, mfr, plant,  |
|   - Arcs = supply chain |     recall, warning letter     |
|   - Red pulse = problem |   - Auto-updates as agent runs |
|     plant               |                                |
|                         |--------------------------------|
|                         |                                |
|                         |   CHAT / AGENT STREAM PANEL    |
|                         |                                |
|                         |   Agent: "Root cause: CGMP     |
|                         |   violation at Acme Pharma     |
|                         |   Cincinnati plant (68% of     |
|                         |   supply)..."                  |
|                         |                                |
+-------------------------+--------------------------------+
```

**Left column (50%)** — `react-globe.gl`: 3D animated earth. Pins light up as the agent identifies
implicated plants. Arcs show supply-chain flow. Problem plant pulses red.

**Right top (50%)** — `react-force-graph-2d`: knowledge graph subgraph. Feeds from
`GET /api/graph/drug/:name?depth=2` — the backend returns `{ nodes, links }` ready to use directly.

**Right bottom** — Chat/stream panel. Displays agent reasoning as SSE events arrive.
Each agent tool call (searchShortages, getManufacturerProfile, etc.) prints a step and
animates the panels above it.

**Search bar** at the top — single text input + Go button. On submit:
- (Now, pre-agent) `GET /api/graph/drug/{input}?depth=2` → render the graph panel
- (Phase 5-6) `POST /api/investigate { drug: input }` → open SSE stream, drive all three panels

---

### Live endpoints (wire these up now)

| Endpoint | What it returns |
|---|---|
| `GET /api/shortages` | All current drug shortages |
| `GET /api/graph/drug/:name?depth=2` | `{ nodes, links }` for force graph |
| `GET /api/graph/manufacturer/:name/risk` | Risk cluster: drugs, plants, warnings, recalls |
| `GET /api/graph/stats` | Node/edge counts (use for a stats bar) |
| `GET /api/refresh/status` | Last data refresh time |

Example call:
```
GET http://localhost:3001/api/graph/drug/Amoxicillin?depth=2
→ { nodes: [...107 nodes...], links: [...] }
```

`POST /api/investigate` (SSE stream) arrives in Phase 5-6 — stub it out for now.

---

## Full Setup (backend dev)

### Prerequisites

- Node.js 18+
- npm 9+

### Install & run

```bash
cd backend
npm install
npm run dev        # starts Express on port 3001, auto-seeds DB from artifacts on first run
```

The server seeds the SQLite database from pre-fetched artifacts on first start (~6 seconds).
No manual data fetch step needed if `backend/artifacts/` is present.

### Refresh data

```bash
# Re-fetch all 13 sources + re-ingest (run once daily, or manually)
npm run refresh

# Re-ingest from existing artifacts only (no network, faster)
npm run ingest
```

### Verify data

```bash
npm run verify:refresh    # prints row counts per table
npm run verify:graph      # prints graph node/edge counts + sample subgraph
```

### One-time scripts

```bash
# Collect FDA warning letter direct URLs via Playwright (~93 seconds, saves to artifacts/)
npm run collect-warning-letters
```

### Environment variables

Copy `.env.example` to `.env` in `backend/` (or set directly):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Express server port |
| `DB_PATH` | `./data/drug_shortage.db` | SQLite database path |
| `DISABLE_AUTO_REFRESH` | — | Set to `true` to skip the startup seed check |
| `ANTHROPIC_API_KEY` | — | Required for Phase 5-6 agent features |

---

## Architecture

```
Scheduled cron (daily 2am)
    └── runChecks()        ← fetches 13 FDA/regulatory sources → artifacts/
    └── runIngestion()     ← parses artifacts → SQLite (130k rows, 12 tables)
    └── invalidateGraph()  ← drops in-memory graphology cache

GET /api/investigate (Phase 5-6)
    └── LangGraph pipeline (EntityResolver → Investigator → RiskPropagator → MitigationPlanner)
    └── SSE stream of structured events → frontend globe + graph animate in real time
```

**Stack:** Express + TypeScript · SQLite (better-sqlite3 + Drizzle ORM) · graphology (76k nodes, 108k edges) · LangGraph JS · claude-sonnet-4-6

---

## Build Status

See [BUILD_STATUS.md](BUILD_STATUS.md) for phase completion, row counts, known data limitations, and what's next.

See [VISION.md](VISION.md) for the full frontend/UX design and SSE event protocol.
