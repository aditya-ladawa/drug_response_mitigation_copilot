# Data Source Audit & Configuration

This document defines all data sources, their optimal fetch strategies, and expected data volumes.

## Source Summary (13 sources)

| # | Source | Type | Current Limit | Optimal Strategy | Total Records | Priority |
|---|--------|------|--------------|------------------|---------------|----------|
| 1 | FDA Drug Shortages | HTML | Single page | Parse `#cont` table + `#dis` table | ~100-200 | Critical |
| 2 | openFDA Drug Enforcement | JSON API | limit=3 | Pagination: limit=1000, skip++ | 17,583 | Critical |
| 3 | FDA Warning Letters Page | HTML | Single page | Parse datatable | ~50/page | Important |
| 4 | FDA Warning Letters XLSX | Binary | Full file | Parse xlsx directly | ~8,000 | Important |
| 5 | FDA Import Alerts | HTML/POST | rows=5 | Increase rows, parse results | ~500+ | Important |
| 6 | openFDA NDC | JSON API | limit=3 | Pagination: limit=1000, skip++ | 134,493 | Critical |
| 7 | DailyMed SPLs | JSON API | pagesize=3 | Pagination: pagesize=100 | 156,124 | Important |
| 8 | FDA Drug Establishments | ZIP | Full ZIP | Extract TSV | ~100,000 | Critical |
| 9 | FDA Orange Book | ZIP | Full ZIP | Extract pipe-delimited | ~30,000 | Important |
| 10 | GDELT DOC API | JSON | maxrecords=5 | Increase to 250, mode=artlist | Variable | Optional |
| 11 | ASHP Drug Shortages | HTML | Single page | Parse shortage list | ~100-200 | Critical |
| 12 | CMS Medicare Part D | JSON API | size=3 | Pagination: size=5000 | Millions | Optional |
| 13 | CMS Open Payments | JSON Catalog | Catalog only | Parse catalog, fetch datasets | Thousands | Optional |

## Pagination Details

### openFDA APIs
- Base URL: `https://api.fda.gov/`
- Max limit per request: 1000
- Use `skip` parameter for pagination
- Rate limit: ~240 requests/minute (be respectful)
- Strategy: Fetch in batches of 1000, stop when no more results

### DailyMed SPLs
- Base URL: `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json`
- Supports `page` and `pagesize` parameters
- Max pagesize: 100 (tested)
- Total pages: ~1562 (at pagesize=100)
- Strategy: Iterate pages 1-N, stop when empty

### CMS Medicare Part D
- Base URL: `https://data.cms.gov/data-api/v1/dataset/{dataset-id}/data`
- Supports `size` and `offset` parameters
- Large dataset (millions of rows)
- Strategy: For MVP, fetch first 10,000 or filter by relevant drugs

### GDELT DOC API
- Base URL: `https://api.gdeltproject.org/api/v2/doc/doc`
- Supports `maxrecords` (max tested: 250)
- Supports `startdatetime`/`enddatetime` for date range
- Strategy: Fetch 250 most recent articles, filter by relevance

### FDA Import Alerts
- POST to search endpoint
- Can increase `rows` parameter
- Strategy: Search "drug" with rows=100, parse all results

## Refresh Strategy
- No cron job
- Server runs refresh every 15 minutes when active
- Each refresh is incremental: re-fetch all sources, re-parse, upsert to SQLite
- Uses a simple lock to prevent concurrent refreshes
- Failed sources are logged but don't block others

## Fault Tolerance
- Each source fetch is wrapped in try/catch
- Retries with exponential backoff (up to 4 attempts)
- Failed sources are skipped, not fatal
- Refresh log tracks success/failure per source
- Graph cache is invalidated only after successful ingestion
