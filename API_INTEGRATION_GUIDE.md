# API Integration Guide — Drug Shortage Copilot

> **For:** Frontend developers / Claude Code integration  
> **Last updated:** 2026-04-26  
> **Backend:** Express + SQLite (port 3001)  
> **Frontend:** Next.js App Router (port 3000)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js Frontend (Port 3000)                               │
│  ├─ App Router API routes (proxy/adapter layer)             │
│  └─ React UI components                                     │
│                      │                                      │
│         ┌────────────┴────────────┐                         │
│         │  HTTP / fetch()         │                         │
│         └────────────┬────────────┘                         │
│                      │                                      │
│  Express Backend (Port 3001)                                │
│  ├─ Data ingestion & refresh (every 15 min)                │
│  ├─ SQLite database (better-sqlite3 + Drizzle)             │
│  └─ REST API endpoints                                      │
└─────────────────────────────────────────────────────────────┘
```

**Critical rule:** The frontend Next.js app should call the Express backend directly via `fetch()` to `http://localhost:3001/api/...`. Do NOT duplicate data logic in Next.js API routes.

---

## Backend Express Endpoints (Port 3001)

### 1. Health Check

```
GET /health
```

**Response:**
```json
{ "status": "ok" }
```

**Use:** Verify backend is alive before making other calls.

---

### 2. Data Refresh

```
POST /api/refresh
```

**Description:** Triggers a manual refresh of all 13 data sources, parses them, and upserts into SQLite. Returns when complete.

**Response:**
```json
{
  "status": "success",
  "sourcesOk": 12,
  "sourcesFailed": 0,
  "durationMs": 45000,
  "results": [
    { "source": "FDA Shortages", "inserted": 76, "errors": 0, "durationMs": 1200 },
    { "source": "openFDA NDC", "inserted": 50000, "errors": 0, "durationMs": 15000 }
  ]
}
```

**Error (409):**
```json
{ "error": "Refresh already in progress" }
```

**Use:** Admin/manual trigger. The backend already auto-refreshes every 15 minutes when running.

---

### 3. Refresh Status

```
GET /api/refresh/status
```

**Response:**
```json
{
  "running": false,
  "lastRefresh": {
    "status": "success",
    "startedAt": "2026-04-26T10:00:00.000Z",
    "completedAt": "2026-04-26T10:01:30.000Z",
    "sourcesOk": 12,
    "sourcesFailed": 0
  }
}
```

**Use:** Show "last updated" timestamp in UI. If `running: true`, show a spinner.

---

### 4. List All Shortages

```
GET /api/shortages
```

**Response:**
```json
{
  "count": 174,
  "records": [
    {
      "id": 1,
      "drugName": "Albuterol Sulfate Solution",
      "status": "Currently in Shortage",
      "source": "FDA",
      "sourceUrl": "https://www.accessdata.fda.gov/scripts/drugshortages/default.cfm",
      "startDate": null,
      "endDate": null,
      "createdAt": "2026-04-26T09:00:00.000Z"
    }
  ]
}
```

**Use:** Dashboard shortage table, homepage stats.

---

### 5. Data Source Check (Debug)

```
GET /api/data-sources
```

**Response:**
```json
{
  "results": [
    {
      "name": "FDA Drug Shortages",
      "kind": "html",
      "url": "https://www.accessdata.fda.gov/scripts/drugshortages/default.cfm",
      "ok": true,
      "summary": "FDA Drug Shortages [text/html]",
      "artifact": "artifacts/fda_drug_shortages.html"
    }
  ]
}
```

**Use:** Debug page to verify all 13 sources are fetchable.

---

## Future Endpoints (Planned for Phase 3+)

These are NOT yet implemented. Build the UI against these contracts:

### 6. Investigate Drug (SSE Streaming)

```
POST /api/investigate
Content-Type: application/json

{ "drug": "Amoxicillin", "scenarioParams": null }
```

**Response:** SSE stream (`text/event-stream`)

```
event: entity_resolved
data: { "drug": "Amoxicillin", "ndcs": 12, "manufacturers": 3 }

event: investigation_step
data: { "step": 1, "tool": "searchShortages", "found": 4 }

event: cause_found
data: { "cause": "Manufacturing delay at XYZ plant", "confidence": "HIGH", "evidence": [...] }

event: risk_drugs
data: { "drugs": [{ "name": "Ampicillin", "risk": "HIGH", "reason": "Same manufacturer" }] }

event: actions
data: { "pharmacy": [...], "procurement": [...], "clinical": [...] }

event: done
data: { "durationMs": 4200 }
```

**Frontend connection pattern:**

```typescript
const response = await fetch("http://localhost:3001/api/investigate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ drug: "Amoxicillin" }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (reader) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Parse SSE events from chunk
  for (const line of chunk.split("\n")) {
    if (line.startsWith("data:")) {
      const data = JSON.parse(line.slice(5).trim());
      // Update UI state
    }
  }
}
```

**Use:** Main investigation flow. Stream results to panels in real time.

---

### 7. Drug Detail

```
GET /api/drug/:name
```

**Response:**
```json
{
  "drug": {
    "id": 1,
    "genericName": "Amoxicillin",
    "brandNames": ["Amoxil", "Trimox"],
    "activeIngredients": [{ "name": "Amoxicillin", "strength": "500 mg" }],
    "therapeuticClass": "Penicillin Antibiotics"
  },
  "ndcs": [...],
  "shortages": [...],
  "recalls": [...]
}
```

---

### 8. Drug Timeline

```
GET /api/drug/:name/timeline
```

**Response:**
```json
{
  "events": [
    { "date": "2025-01-15", "type": "shortage", "description": "Shortage reported" },
    { "date": "2025-03-20", "type": "recall", "description": "Class II recall" }
  ]
}
```

---

### 9. Drug Graph (Subgraph)

```
GET /api/drug/:name/graph?depth=2
```

**Response:**
```json
{
  "nodes": [
    { "id": "drug_1", "type": "drug", "label": "Amoxicillin" },
    { "id": "mfr_5", "type": "manufacturer", "label": "Teva" }
  ],
  "links": [
    { "source": "drug_1", "target": "mfr_5", "type": "has_ndc" }
  ]
}
```

---

### 10. Therapeutic Alternatives

```
GET /api/alternatives/:name
```

**Response:**
```json
{
  "alternatives": [
    { "genericName": "Ampicillin", "teCode": "AB", "applicant": "Sandoz" }
  ]
}
```

---

### 11. Manufacturer Profile

```
GET /api/manufacturer/:name
```

**Response:**
```json
{
  "manufacturer": { "name": "Teva", "normalizedName": "TEVA" },
  "establishments": [...],
  "warningLetters": [...],
  "importAlerts": [...]
}
```

---

## Current Frontend → Backend Connection Map

| UI Feature | Frontend Route | Should Call Backend |
|------------|---------------|---------------------|
| Dashboard stats | `/` | `GET /api/shortages` |
| Shortage table | `/` | `GET /api/shortages` |
| Investigation | `/investigate` | `POST /api/investigate` (SSE) |
| Drug detail | `/drug/[name]` | `GET /api/drug/:name` |
| Graph view | `/drug/[name]/graph` | `GET /api/drug/:name/graph` |
| Timeline | `/drug/[name]/timeline` | `GET /api/drug/:name/timeline` |
| Alternatives | `/drug/[name]/alternatives` | `GET /api/alternatives/:name` |
| Manufacturer | `/manufacturer/[name]` | `GET /api/manufacturer/:name` |
| Admin/refresh | `/admin` | `POST /api/refresh` |

---

## Important Integration Notes

### CORS
Backend has `cors()` middleware enabled. Frontend at `localhost:3000` can call `localhost:3001` without issues.

### Environment Variables (Frontend)
Create `app/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Environment Variables (Backend)
Create `backend/.env`:
```
PORT=3001
DB_PATH=./data/drug_shortage.db
REFRESH_INTERVAL_MINUTES=15
```

### Running Both Services
```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd app
npm run dev
```

### Mock Data Cleanup
The frontend currently has mock API routes in:
- `app/src/app/api/investigate/route.ts`
- `app/src/app/api/graph/drug/[name]/route.ts`

**These should be replaced** with real backend calls as documented above. The mock graph data in `app/src/lib/mock-graph.ts` should be removed once the real graph endpoints are live.

---

## Data Refresh Behavior

- **Auto-refresh:** Every 15 minutes while backend is running
- **Manual refresh:** `POST /api/refresh` (admin only)
- **Concurrency:** Only one refresh runs at a time. Second request gets 409.
- **Failure handling:** Failed sources are skipped, others continue. Logged in `refresh_log` table.

---

## Database Summary (for reference)

Tables populated after ingestion:

| Table | Records (MVP) | Description |
|-------|--------------|-------------|
| `drugs` | ~169 | Canonical drug entities |
| `shortage_records` | ~174 | FDA + ASHP shortage listings |
| `recall_events` | ~3+ | openFDA enforcement (paginates to 50K) |
| `warning_letters` | ~1000 | FDA warning letters |
| `import_alerts` | ~5+ | FDA import alerts |
| `establishments` | ~10,161 | FDA drug establishment registrations |
| `orange_book_entries` | ~48,083 | Therapeutic equivalents |
| `spl_labels` | ~3+ | DailyMed SPLs (paginates to 10K) |
| `news_signals` | ~5+ | GDELT news articles |
| `manufacturers` | ~3+ | Deduplicated manufacturers |
| `refresh_log` | Per run | Tracks each refresh attempt |

---

## Claude Code Integration Prompt

When implementing frontend features, Claude should:

1. **Read this file first** before writing any API calls
2. **Call the Express backend directly** at `http://localhost:3001/api/...`
3. **Use the exact endpoint contracts** documented above
4. **Replace mock routes** in `app/src/app/api/*` with real backend calls
5. **Handle SSE streaming** for `/api/investigate` using `ReadableStream` + `TextDecoder`
6. **Show refresh status** by polling `GET /api/refresh/status` every 30 seconds
