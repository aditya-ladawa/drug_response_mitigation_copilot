# Drug Shortage Response & Mitigation Copilot

AI-powered supply chain intelligence tool for pharmacy, procurement, and clinical teams.
Investigates drug shortages, traces root causes, surfaces regulatory history, and recommends
role-specific mitigation actions — driven by a live knowledge graph of 13 FDA data sources.

---

## If Darshan (frontend):

You only need to run two commands from the repo root:

```bash
# Terminal 1 — backend API (port 3001)
cd backend && npm install && npm run dev

# Terminal 2 — frontend dev server (port 3000)
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. The backend must be running for any API calls to work.

**Backend base URL:** `http://localhost:3001`

Key endpoints available right now (no agent needed):
| Endpoint | What it returns |
|---|---|
| `GET /health` | Server status |
| `GET /api/shortages` | All current drug shortages |
| `GET /api/graph/stats` | Knowledge graph node/edge counts |
| `GET /api/graph/drug/:name?depth=2` | Supply-chain subgraph for a drug (use for force graph) |
| `GET /api/graph/manufacturer/:name/risk` | Risk cluster: drugs, plants, warnings, recalls |
| `GET /api/refresh/status` | Last data refresh timestamp + stats |

Example:
```
GET http://localhost:3001/api/graph/drug/Amoxicillin?depth=2
→ { nodes: [...], links: [...] }   # ready for react-force-graph-2d
```

The agent investigation endpoint (`POST /api/investigate`) is coming in Phase 5-6. For now,
wire up the graph visualization and shortage list using the endpoints above.

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
