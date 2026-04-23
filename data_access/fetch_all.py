from __future__ import annotations

import json
import re
import time
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zipfile import ZipFile
import io


BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
USER_AGENT = "ant-hack-data-access/0.1 (+local prototype)"
TIMEOUT_SECONDS = 30
MAX_RETRIES = 4

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
}


@dataclass(frozen=True)
class SourceResult:
    name: str
    kind: str
    url: str
    ok: bool
    summary: str
    artifact: str | None = None


def make_request(url: str, headers: dict[str, str] | None = None) -> Request:
    merged_headers = dict(DEFAULT_HEADERS)
    if headers:
        merged_headers.update(headers)
    return Request(url, headers=merged_headers)


def fetch_bytes(url: str, headers: dict[str, str] | None = None) -> tuple[bytes, str]:
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            request = make_request(url, headers=headers)
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                return response.read(), response.headers.get("Content-Type", "")
        except (HTTPError, URLError) as error:
            last_error = error
            if attempt == MAX_RETRIES:
                raise
            time.sleep(min(2**attempt, 8))

    assert last_error is not None
    raise last_error


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def extract_title(html: str) -> str:
    match = re.search(r"<title>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return "No title found"
    return re.sub(r"\s+", " ", match.group(1)).strip()


def save_artifact(name: str, suffix: str, payload: bytes) -> str:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    path = ARTIFACTS_DIR / f"{safe_slug(name)}{suffix}"
    path.write_bytes(payload)
    return str(path.relative_to(BASE_DIR.parent))


def fetch_html_source(name: str, url: str) -> SourceResult:
    payload, content_type = fetch_bytes(url)
    artifact = save_artifact(name, ".html", payload)
    html = payload.decode("utf-8", errors="replace")
    title = extract_title(html)
    return SourceResult(name, "html", url, True, f"{title} [{content_type}]", artifact)


def fetch_html_with_headers(name: str, url: str, headers: dict[str, str]) -> SourceResult:
    payload, content_type = fetch_bytes(url, headers=headers)
    artifact = save_artifact(name, ".html", payload)
    html = payload.decode("utf-8", errors="replace")
    title = extract_title(html)
    return SourceResult(name, "html", url, True, f"{title} [{content_type}]", artifact)


def fetch_json_source(name: str, url: str) -> SourceResult:
    payload, content_type = fetch_bytes(url, headers={"Accept": "application/json,*/*;q=0.8"})
    artifact = save_artifact(name, ".json", payload)
    data = json.loads(payload.decode("utf-8"))

    if isinstance(data, dict):
        top_level_keys = ", ".join(sorted(data.keys())[:8])
        results = data.get("results")
        if isinstance(results, list):
            summary = f"keys={top_level_keys}; results={len(results)} [{content_type}]"
        else:
            summary = f"keys={top_level_keys} [{content_type}]"
    else:
        summary = f"json_type={type(data).__name__} [{content_type}]"

    return SourceResult(name, "json", url, True, summary, artifact)


def fetch_zip_source(name: str, url: str) -> SourceResult:
    payload, content_type = fetch_bytes(url, headers={"Accept": "application/zip,application/octet-stream,*/*;q=0.8"})
    artifact = save_artifact(name, ".zip", payload)
    with ZipFile(io.BytesIO(payload)) as archive:
        members = archive.namelist()
    preview = ", ".join(members[:5]) if members else "no files"
    summary = f"files={len(members)}; preview={preview} [{content_type}]"
    return SourceResult(name, "zip", url, True, summary, artifact)


def fetch_binary_source(name: str, url: str, suffix: str) -> SourceResult:
    payload, content_type = fetch_bytes(url, headers={"Accept": "application/octet-stream,*/*;q=0.8"})
    artifact = save_artifact(name, suffix, payload)
    summary = f"downloaded={len(payload)} bytes [{content_type}]"
    return SourceResult(name, suffix.lstrip("."), url, True, summary, artifact)


def fetch_import_alert_search(name: str) -> SourceResult:
    url = "https://www.accessdata.fda.gov/scripts/importalertsearch/searchResults.cfm"
    body = urlencode({"query": "drug", "start": 0, "rows": 5, "page": 1}).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers={
            **DEFAULT_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": "https://www.accessdata.fda.gov",
            "Referer": "https://www.accessdata.fda.gov/scripts/importalertsearch/search.cfm",
        },
    )
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                payload = response.read()
                content_type = response.headers.get("Content-Type", "")
                artifact = save_artifact(name, ".html", payload)
                html = payload.decode("utf-8", errors="replace")
                summary = f"title={extract_title(html)} [{content_type}]"
                return SourceResult(name, "html", url, True, summary, artifact)
        except (HTTPError, URLError) as error:
            last_error = error
            if attempt == MAX_RETRIES:
                raise
            time.sleep(min(2**attempt, 8))
    assert last_error is not None
    raise last_error


def fetch_ashp_source(name: str) -> SourceResult:
    return fetch_html_with_headers(
        name,
        "https://www.ashp.org/drug-shortages/current-shortages",
        {
            "Referer": "https://www.ashp.org/",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document",
        },
    )


def fetch_cms_dataset_json(name: str, url: str) -> SourceResult:
    payload, content_type = fetch_bytes(url, headers={"Accept": "application/json,*/*;q=0.8"})
    artifact = save_artifact(name, ".json", payload)
    data = json.loads(payload.decode("utf-8"))
    summary = f"rows={len(data) if isinstance(data, list) else 'n/a'} [{content_type}]"
    return SourceResult(name, "json", url, True, summary, artifact)


def fetch_cms_catalog(name: str, url: str) -> SourceResult:
    payload, content_type = fetch_bytes(url, headers={"Accept": "application/json,*/*;q=0.8"})
    artifact = save_artifact(name, ".json", payload)
    data = json.loads(payload.decode("utf-8"))
    dataset_count = len(data.get("dataset", [])) if isinstance(data, dict) else "n/a"
    return SourceResult(name, "json", url, True, f"datasets={dataset_count} [{content_type}]", artifact)


def fetch_gdelt_source(name: str) -> SourceResult:
    url = build_gdelt_url()
    payload, content_type = fetch_bytes(url, headers={"Accept": "application/json,*/*;q=0.8"})
    artifact = save_artifact(name, ".json", payload)
    text = payload.decode("utf-8", errors="replace")
    if text.lstrip().startswith("{"):
        data = json.loads(text)
        articles = data.get("articles", [])
        return SourceResult(name, "json", url, True, f"articles={len(articles)} [{content_type}]", artifact)
    preview = re.sub(r"\s+", " ", text[:180]).strip()
    return SourceResult(name, "json", url, False, f"Non-JSON response: {preview}", artifact)


def manual_follow_up(name: str, url: str, note: str) -> SourceResult:
    return SourceResult(name, "manual", url, False, note, None)


def build_gdelt_url() -> str:
    query = urlencode(
        {
            "query": '("drug shortage" OR "pharmaceutical shortage")',
            "mode": "artlist",
            "maxrecords": 5,
            "format": "json",
        }
    )
    return f"https://api.gdeltproject.org/api/v2/doc/doc?{query}"


def run_checks() -> list[SourceResult]:
    checks: list[tuple[str, Callable[[], SourceResult]]] = [
        (
            "FDA Drug Shortages",
            lambda: fetch_html_source(
                "FDA Drug Shortages",
                "https://www.accessdata.fda.gov/scripts/drugshortages/default.cfm",
            ),
        ),
        (
            "openFDA Drug Enforcement",
            lambda: fetch_json_source(
                "openFDA Drug Enforcement",
                "https://api.fda.gov/drug/enforcement.json?limit=3",
            ),
        ),
        (
            "FDA Warning Letters Page",
            lambda: fetch_html_source(
                "FDA Warning Letters Page",
                "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters",
            ),
        ),
        (
            "FDA Warning Letters XLSX",
            lambda: fetch_binary_source(
                "FDA Warning Letters XLSX",
                "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters/datatables-data?page&_format=xlsx",
                ".xlsx",
            ),
        ),
        (
            "FDA Import Alerts",
            lambda: fetch_import_alert_search("FDA Import Alerts"),
        ),
        (
            "openFDA NDC",
            lambda: fetch_json_source(
                "openFDA NDC",
                "https://api.fda.gov/drug/ndc.json?limit=3",
            ),
        ),
        (
            "DailyMed SPLs",
            lambda: fetch_json_source(
                "DailyMed SPLs",
                "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?page=1&pagesize=3",
            ),
        ),
        (
            "FDA Drug Establishments",
            lambda: fetch_zip_source(
                "FDA Drug Establishments",
                "https://www.accessdata.fda.gov/cder/drls_reg.zip",
            ),
        ),
        (
            "FDA Orange Book",
            lambda: fetch_zip_source(
                "FDA Orange Book",
                "https://www.fda.gov/media/76860/download?attachment",
            ),
        ),
        (
            "GDELT DOC API",
            lambda: fetch_gdelt_source("GDELT DOC API"),
        ),
        (
            "ASHP Drug Shortages",
            lambda: fetch_ashp_source("ASHP Drug Shortages"),
        ),
        (
            "CMS Medicare Part D",
            lambda: fetch_cms_dataset_json(
                "CMS Medicare Part D",
                "https://data.cms.gov/data-api/v1/dataset/e54db557-cd82-4e91-a0fe-61aad5865d69/data?size=3",
            ),
        ),
        (
            "CMS Open Payments",
            lambda: fetch_cms_catalog(
                "CMS Open Payments",
                "https://openpaymentsdata.cms.gov/data.json",
            ),
        ),
    ]

    results: list[SourceResult] = []
    for name, check in checks:
        try:
            results.append(check())
        except HTTPError as error:
            results.append(
                SourceResult(name, "error", error.url, False, f"HTTP {error.code}: {error.reason}")
            )
        except URLError as error:
            results.append(
                SourceResult(name, "error", "", False, f"URL error: {error.reason}")
            )
        except Exception as error:  # noqa: BLE001
            results.append(SourceResult(name, "error", "", False, f"{type(error).__name__}: {error}"))
    return results


def print_results(results: list[SourceResult]) -> int:
    ok_count = sum(1 for result in results if result.ok)
    print(f"Checked {len(results)} sources; successful={ok_count}; failed_or_manual={len(results) - ok_count}\n")
    for result in results:
        status = "OK" if result.ok else "SKIP/FAIL"
        print(f"[{status}] {result.name}")
        print(f"  kind: {result.kind}")
        if result.url:
            print(f"  url: {result.url}")
        print(f"  summary: {result.summary}")
        if result.artifact:
            print(f"  artifact: {result.artifact}")
        print()
    return 0 if ok_count else 1


def main() -> int:
    results = run_checks()
    return print_results(results)


if __name__ == "__main__":
    sys.exit(main())
