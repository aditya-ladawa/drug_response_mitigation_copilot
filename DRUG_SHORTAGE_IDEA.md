# Drug Shortage Response and Mitigation Copilot

## Overview

This project is an investigative and decision-support system for drug shortages.

The core problem is not just detecting that a drug is in shortage. The real problem is that pharmacists, procurement teams, hospital operators, and policy analysts often cannot quickly answer:

- why the shortage is happening
- which manufacturers, plants, or regulatory events are involved
- what other products are exposed to the same risk
- what to do right now
- what policy or sourcing changes would reduce future risk

The product should turn fragmented public data into a continuously updated workspace for:

- root-cause investigation
- mitigation planning
- scenario testing
- actionable next steps

It is not a simple dashboard and not a summarization bot.

It should feel like a command center with:

- evidence-backed reasoning
- graph, timeline, and map views
- role-specific actions
- counterfactual simulation

## Product Thesis

Most shortage tools stop at one of these layers:

- shortage tracking
- prediction
- local inventory management
- substitute lookup

This project aims to unify all of them in one flow:

1. Investigate the shortage
2. Understand the likely cause chain
3. Identify what is at risk next
4. Recommend actions by stakeholder
5. Simulate mitigation options

The real product is closer to:

`Drug Shortage Command Center`

or

`Drug Shortage Response and Mitigation Copilot`

than just `Drug Shortage Root Cause Explorer`.

## Core User Questions

The system should help answer:

- Why is this drug short?
- Which manufacturers or plants are implicated?
- Was the trigger a recall, warning letter, import alert, quality issue, demand spike, or discontinuation?
- Which related drugs, NDCs, or therapeutic classes are exposed to the same upstream risks?
- What should pharmacy teams do in the next 24 hours?
- What should procurement do in the next 7 days?
- What longer-term sourcing or stock policy changes would reduce future pain?

## Detailed Idea

The system should ingest fresh public regulatory and market context data and convert it into a unified shortage knowledge graph.

Example entities:

- drug
- active ingredient
- NDC
- manufacturer
- applicant
- plant / establishment
- warning letter
- recall
- import alert
- shortage record
- label / SPL
- therapeutic equivalent / substitute

Example relationships:

- drug -> has_ndc -> ndc
- drug -> has_labeler -> manufacturer
- manufacturer -> operates -> plant
- plant -> received -> warning_letter
- manufacturer -> affected_by -> import_alert
- shortage -> linked_to -> recall
- product -> therapeutic_equivalent_to -> product

The system should then run a layered workflow:

### 1. Investigation

For a selected drug, gather all related public signals and produce a ranked explanation of likely causes.

### 2. Risk Propagation

Show what else may break if the same manufacturer, plant, ingredient, or import path is disrupted.

### 3. Response Planning

Provide stakeholder-specific actions, such as:

- pharmacy: conservation or substitution
- procurement: alternate sources or risk monitoring
- clinical: substitute treatment pathways

### 4. Scenario Testing

Allow the user to test questions like:

- what if one more supplier fails?
- what if demand rises 15%?
- what if we switch to substitute drug A?
- what if we source from manufacturer B?

## Why This Is Useful

This matters because shortage management is still fragmented and manual.

Today, users often need to check:

- FDA shortage pages
- warning letters
- recall records
- import alerts
- label/product data
- manufacturer identity records
- local knowledge and spreadsheets

That process is slow, brittle, and not scenario-aware.

This project compresses that into one investigative surface.

## Intended Impact

Potential impact areas:

- hospital operations
- patient safety
- procurement resilience
- pharmacy planning
- public health visibility
- health-system risk monitoring

If done well, the system can help users move from:

- reactive shortage tracking

to:

- proactive shortage response and resilience planning

## Ideal Interface

The strongest UI would combine:

### Graph View

A connected dependency graph showing:

- drugs
- NDCs
- manufacturers
- plants
- recalls
- warning letters
- import alerts

### Timeline View

Chronological sequence of:

- shortage start
- recall events
- warning letters
- import actions
- label changes
- news signals

### Map View

Geographic view of implicated plants, regions, and manufacturing locations.

### Action Panel

Clear outputs for:

- likely root cause
- confidence
- supporting evidence
- alternative products / manufacturers
- recommended next actions
- watchlist recommendations

### Scenario Lab

Interactive simulation of mitigation strategies and likely downstream impact.

## Agent Roles

Potential agent roles:

- Entity Resolver: matches drugs, NDCs, companies, applicants, and plants
- Regulatory Evidence Miner: links recalls, warning letters, import alerts, and shortage records
- Causal Chain Analyst: builds and ranks likely cause pathways
- Risk Propagation Agent: finds adjacent products or dependencies at risk
- Mitigation Planner: proposes actions for pharmacy, procurement, and clinical users
- Scenario Analyst: tests intervention options and compares outcomes

## Current Code Progress

Code progress so far is focused on data-access validation.

Implemented:

- `data_access/fetch_all.py`
- `data_access/README.md`

What the script currently does:

- uses Python to access all currently scoped public data sources
- includes browser-like headers, retries, and source-specific handling
- saves artifacts into `data_access/artifacts/`
- proves that the public source stack is accessible from this environment

Validated command:

```bash
cd /home/aditya-ladawa/Aditya/great_projects/ant_hack
source .venv/bin/activate
python data_access/fetch_all.py
```

Artifacts now include sample JSON, HTML, ZIP, and XLSX outputs for all currently wired sources.

## Data Sources Successfully Available To Us

The following sources were successfully accessed from Python:

1. `FDA Drug Shortages`
2. `openFDA Drug Enforcement`
3. `FDA Warning Letters Page`
4. `FDA Warning Letters XLSX`
5. `FDA Import Alerts`
6. `openFDA NDC`
7. `DailyMed SPLs`
8. `FDA Drug Establishments`
9. `FDA Orange Book`
10. `GDELT DOC API`
11. `ASHP Drug Shortages`
12. `CMS Medicare Part D`
13. `CMS Open Payments`

### Access Type Summary

#### Clean API / JSON sources

- `openFDA Drug Enforcement`
- `openFDA NDC`
- `DailyMed SPLs`
- `GDELT DOC API`
- `CMS Medicare Part D`
- `CMS Open Payments` catalog JSON

#### Download / file sources

- `FDA Warning Letters XLSX`
- `FDA Drug Establishments` ZIP
- `FDA Orange Book` ZIP

#### HTML / scrape-oriented sources

- `FDA Drug Shortages`
- `FDA Warning Letters Page`
- `FDA Import Alerts`
- `ASHP Drug Shortages`

## Strong MVP Data Stack

Best core sources for MVP:

- `FDA Drug Shortages`
- `openFDA Drug Enforcement`
- `FDA Warning Letters`
- `FDA Import Alerts`
- `openFDA NDC`
- `DailyMed`
- `FDA Drug Establishments`
- `FDA Orange Book`
- optional `GDELT` for fresh weak-signal context

## What We Should Build Next

### Data Layer

- normalize source schemas into one internal model
- define entities and relationships
- build canonical IDs for drugs, NDCs, manufacturers, and establishments
- ingest and persist source snapshots

### Domain Model

- construct shortage event objects
- construct manufacturer / plant / product dependency graph
- add timeline linkage across events

### Investigation Layer

- root-cause ranking
- evidence linking
- confidence scoring
- affected-product expansion

### Mitigation Layer

- alternative products / equivalents
- alternate manufacturer suggestions
- watchlist generation
- role-specific action recommendations

### UI Layer

- graph explorer
- timeline explorer
- map view
- shortage detail page
- scenario simulation panel

## Suggested MVP Scope

To keep the first version sharp:

- focus on one high-value set of drugs or one therapeutic category
- support a strong evidence graph and timeline first
- add mitigation recommendations before advanced simulation

Recommended MVP sequence:

1. data ingestion and normalization
2. shortage detail page with evidence timeline
3. manufacturer / plant dependency graph
4. root-cause analysis output
5. mitigation suggestions
6. scenario lab

## Todos

### Immediate

- define internal schemas for all source types
- add persistent storage for fetched source data
- parse and normalize all successful artifacts
- identify a first therapeutic category or drug subset

### Near-term

- build entity resolution layer for drug/manufacturer/plant mapping
- create shortage case objects and evidence linking
- generate root-cause candidates from public records
- add substitute / equivalent product linking

### Product

- design graph + timeline + map layout
- define role-specific workflows
- design shortage case page
- design action recommendation panel

### Stretch

- add scenario simulation
- add risk propagation to adjacent drugs/manufacturers
- add watchlist and alerting
- add saved investigations / case management

## Risks / Caveats

- public data is fresh, but not operationally complete
- real hospital-grade actionability would eventually need private inventory, formulary, contract, or utilization data
- some sources are scrape-oriented and may need resilient parsing logic
- root-cause inference must be evidence-backed and carefully framed, not overclaimed

## Current Status

Status: `idea validated at data-access level`

We have confirmed that the public source stack is accessible from Python and is good enough to start building the investigation layer.

The next real milestone is not more source hunting.

It is:

`build the normalized shortage intelligence graph and first shortage case experience.`
