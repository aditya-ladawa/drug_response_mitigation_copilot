# Frontend Vision & Product Strategy

## Original Vision

Split-screen layout (2 columns, 50/50):
- **Left column**: 3D interactive animated earth with pins for drug factories/plants
- **Right column top**: Knowledge graph panel (auto-updating)
- **Right column bottom**: Chat panel

---

## Why it can work

The 3D globe isn't the hard part. Proven libraries do the heavy lifting:
- **`react-globe.gl`** (wraps three.js, ~30KB) — animated earth, pins, arcs, hover events
- **`cobe`** (~5KB) — Stripe uses this; even lighter
- Chat + knowledge graph panels are standard React patterns

Teammate can ship this in 1–2 days if the data is ready.

---

## The real problem: 10,161 pins = noise

The DB has 10,161 establishments. Pinning all of them makes the globe look like a rash, not a command center. Need **pins that narrate the shortage story**, not every factory on Earth.

Also: current establishment data has `city=""` and `state=""` (the parser dropped the address split). No city = no coordinates = no pins. This is a data gap we need to close.

---

## What makes it actually impressive

Reframe the globe as the **visualization of the agent's reasoning** — not a static map:

1. User picks **Adderall** →
2. Globe zooms to North America, pins light up for all Amphetamine manufacturers (from our drugs→NDCs→manufacturers→establishments chain)
3. Arcs draw from problem plant → affected distribution regions
4. Warning-letter plant pulses red
5. Knowledge graph panel shows the same subgraph the agent is walking
6. Chat streams: *"Root cause: CGMP violations at Acme Pharma's Cincinnati plant, which supplies 68% of extended-release formulations…"*

The globe **animates the investigation**. That's the demo moment.

---

## Backend gaps to close before frontend can use this

| Gap | Fix |
|---|---|
| Establishments missing city/state | Parse `drls_reg.txt` properly — address field is combined; split it |
| No lat/lng columns | Add `lat`, `lng` to `establishments` schema; geocode via Nominatim or cached US cities list |
| No "live supply chain" endpoint | `GET /api/drug/:name/supply-chain` → returns pins + arcs for that drug |
| No investigation stream | SSE events from agent (Phase 6) drive the animations |

---

## Beyond the original vision — higher ceiling ideas

### 🥇 1. Make the agent's reasoning *visible* — Claude drives the UI

This is the one most teams won't think to do, and it's uniquely on-brand for an Anthropic-sponsored demo.

Instead of "agent returns results → UI renders them," flip it: **every tool call the agent makes streams to the UI and animates it.**

```
Agent calls searchShortages("Adderall")     →  globe zooms to US
Agent calls getManufacturerProfile(...)     →  pins light up on 8 plants
Agent calls searchWarningLetters(...)       →  one plant pulses red
Agent calls getTherapeuticAlternatives(...) →  alt drugs float into side panel
Agent's reasoning text streams into chat simultaneously
```

Users literally *watch Claude think*. The agent isn't behind a loading spinner — it's puppeteering the entire interface. Nobody else will demo this.

### 🥈 2. "War room" with parallel specialist agents

LangGraph makes this trivial. Instead of one agent, run 5 in parallel, each with an identity and visible stream:

```
┌─ Entity Resolver ──────── "Confirmed: Adderall = 23 NDCs, 8 manufacturers"
├─ Evidence Miner ───────── "Found 3 warning letters, 2 recalls"
├─ Risk Propagator ──────── "4 other ADHD drugs share the problem supplier"
├─ Mitigation Planner ───── "Substitute with lisdexamfetamine — AB-rated"
└─ Scenario Analyst ─────── "If plant stays down 90 days: 140k pts impacted"
```

Each agent streams into its own card in the chat panel. Feels like a team of experts working the problem. **This demo makes it obvious why multi-agent orchestration matters.**

### 🥉 3. Crisis simulator — click a plant, watch the cascade

User clicks any pin on the globe → "Simulate 90-day shutdown" button

- Agent traces cascade: plant → drugs → CMS Part D prescription volume → states affected
- Globe shows a wave of red spreading across states over 30/60/90 days
- Chat streams: *"At day 30, 7,400 patients lose access to extended-release formulations in Texas; at day 60, spreads to Georgia, Florida as regional stockpiles deplete…"*
- **The numbers are real** — CMS Part D data (prescriber/drug/claims) backs every claim

This turns abstract supply-chain risk into *visceral patient impact*.

### 🏅 4. Therapeutic alternative recommendations with confidence

We already have the data — **48,083 Orange Book entries with TE (Therapeutic Equivalence) codes**. "AB-rated" = bioequivalent, FDA-certified substitutable.

Agent can say: *"The following AB-rated alternatives are available from different manufacturers than the affected one"* — with FDA citation. A pharmacist could actually use this output.

---

## Tier 2 — high impact, moderate effort

| Idea | Why it lands |
|---|---|
| **Time-travel slider** | Scrub through the past 2 years, watch shortages propagate. Reveals structural patterns. We have date fields on all events. |
| **Predictive risk signal** | "3 plants have warning letters from the past 90 days — historical correlation says their products are 3.2× more likely to shortage within 6mo." Real data science with real data. |
| **Action Brief PDF export** | 1-click printable 1-page brief for the procurement team. Feels like a product, not a toy. |
| **Co-exposure heat map** | When Adderall was short, what else was short from the same upstream? Reveals hidden structural dependencies. |

---

## Tier 3 — cool but lower ROI for this demo

- Voice mode (Whisper + TTS) — adds infra complexity
- Slack/Teams bot — scope creep
- Mobile companion — probably unnecessary

---

## Key architectural decision

Before Phase 6 (agents), design the **agent→UI event protocol**:

Every tool call emits an SSE event with animation metadata:
```json
{ "event": "tool_call", "tool": "highlightPlant", "plantId": 42, "color": "red" }
{ "event": "tool_call", "tool": "zoomGlobe", "lat": 39.1, "lng": -84.5 }
{ "event": "tool_call", "tool": "addGraphEdge", "from": "drug:42", "to": "mfr:17" }
{ "event": "agent_text", "agent": "Evidence Miner", "text": "Found 3 warning letters..." }
```

The frontend is dumb — it just subscribes and animates whatever arrives. This architecture enables all tier-1 items.

---

## Build order recommendation

1. ✅ Phase 1–3 (data, ingestion, refresh) — done
2. → Phase 4: Knowledge Graph (graphology)
3. → Geo-enrichment subtask: fix establishment city/state, add lat/lng (~1h)
4. → Phase 5: Agent tools (LangChain tools wrapping DB + graph)
5. → Phase 6: LangGraph agents + design SSE event protocol
6. → Phase 7: API + SSE streaming
7. → Frontend: globe driven by SSE event stream

The globe is **last to build** — after agents are streaming. Teammate can mock it with dummy pins until then.
