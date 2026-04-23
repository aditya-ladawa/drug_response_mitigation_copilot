# Data Access Checks

This folder contains a small stdlib-only script that tries the data sources we discussed for the drug shortage project.

## Run

```bash
source .venv/bin/activate
python data_access/fetch_all.py
```

## What it does

- hits REST/JSON sources directly where available
- downloads ZIP/XLSX artifacts for file-based sources
- saves artifacts to `data_access/artifacts/`
- marks portal-backed sources that need separate API/export discovery

## Covered sources

- FDA Drug Shortages
- openFDA Drug Enforcement
- FDA Warning Letters page and XLSX export
- FDA Import Alerts
- openFDA NDC
- DailyMed SPL API
- FDA Drug Establishments ZIP
- FDA Orange Book ZIP
- GDELT DOC API
- ASHP Drug Shortages
- CMS Medicare Part D (manual follow-up)
- CMS Open Payments (manual follow-up)
