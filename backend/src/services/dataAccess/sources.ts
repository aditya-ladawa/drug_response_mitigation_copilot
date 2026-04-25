import AdmZip from 'adm-zip';
import { URLSearchParams } from 'url';
import { SourceResult } from '../../types';
import {
  extractTitle,
  fetchBytes,
  fetchBytesPost,
  fetchBytesViaProxy,
  fetchJson,
  fetchProxyList,
  readArtifact,
  saveArtifact,
} from './fetcher';

// ── Generic fetchers ─────────────────────────────────────────────────────────

export async function fetchHtmlSource(name: string, url: string): Promise<SourceResult> {
  const [payload, contentType] = await fetchBytes(url);
  const artifact = saveArtifact(name, '.html', payload);
  const title = extractTitle(payload.toString('utf8'));
  return { name, kind: 'html', url, ok: true, summary: `${title} [${contentType}]`, artifact };
}

export async function fetchHtmlWithHeaders(
  name: string,
  url: string,
  headers: Record<string, string>,
): Promise<SourceResult> {
  const [payload, contentType] = await fetchBytes(url, headers);
  const artifact = saveArtifact(name, '.html', payload);
  const title = extractTitle(payload.toString('utf8'));
  return { name, kind: 'html', url, ok: true, summary: `${title} [${contentType}]`, artifact };
}

export async function fetchJsonSource(name: string, url: string): Promise<SourceResult> {
  const [payload, contentType] = await fetchBytes(url, { Accept: 'application/json,*/*;q=0.8' });
  const artifact = saveArtifact(name, '.json', payload);
  const data: unknown = JSON.parse(payload.toString('utf8'));

  let summary: string;
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const topKeys = Object.keys(obj).sort().slice(0, 8).join(', ');
    const results = obj['results'];
    summary = Array.isArray(results)
      ? `keys=${topKeys}; results=${results.length} [${contentType}]`
      : `keys=${topKeys} [${contentType}]`;
  } else {
    summary = `json_type=${Array.isArray(data) ? 'array' : typeof data} [${contentType}]`;
  }

  return { name, kind: 'json', url, ok: true, summary, artifact };
}

export async function fetchZipSource(name: string, url: string): Promise<SourceResult> {
  const [payload, contentType] = await fetchBytes(url, {
    Accept: 'application/zip,application/octet-stream,*/*;q=0.8',
  });
  const artifact = saveArtifact(name, '.zip', payload);
  const zip = new AdmZip(payload);
  const members = zip.getEntries().map((e: AdmZip.IZipEntry) => e.entryName);
  const preview = members.slice(0, 5).join(', ') || 'no files';
  return {
    name,
    kind: 'zip',
    url,
    ok: true,
    summary: `files=${members.length}; preview=${preview} [${contentType}]`,
    artifact,
  };
}

export async function fetchBinarySource(
  name: string,
  url: string,
  suffix: string,
): Promise<SourceResult> {
  const [payload, contentType] = await fetchBytes(url, {
    Accept: 'application/octet-stream,*/*;q=0.8',
  });
  const artifact = saveArtifact(name, suffix, payload);
  return {
    name,
    kind: suffix.replace(/^\./, ''),
    url,
    ok: true,
    summary: `downloaded=${payload.length} bytes [${contentType}]`,
    artifact,
  };
}

// ── Source-specific fetchers ─────────────────────────────────────────────────

export async function fetchImportAlertSearch(name: string): Promise<SourceResult> {
  const url = 'https://www.accessdata.fda.gov/scripts/importalertsearch/searchResults.cfm';
  const body = new URLSearchParams({
    query: 'drug',
    start: '0',
    rows: '100',
    page: '1',
  }).toString();

  const [payload, contentType] = await fetchBytesPost(url, body, {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Origin: 'https://www.accessdata.fda.gov',
    Referer: 'https://www.accessdata.fda.gov/scripts/importalertsearch/search.cfm',
  });

  const artifact = saveArtifact(name, '.html', payload);
  const title = extractTitle(payload.toString('utf8'));
  return { name, kind: 'html', url, ok: true, summary: `title=${title} [${contentType}]`, artifact };
}

export async function fetchAshpSource(name: string): Promise<SourceResult> {
  // The nav landing page doesn't contain actual drug data — the real list lives
  // at the filtered list URL. Go straight to the CurrentShortages view.
  const url =
    'https://www.ashp.org/Drug-Shortages/Current-Shortages/drug-shortages-list?page=CurrentShortages';
  const extraHeaders = {
    Referer: 'https://www.ashp.org/drug-shortages/current-shortages',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'document',
  };

  try {
    return await fetchHtmlWithHeaders(name, url, extraHeaders);
  } catch {
    console.log(`  [${name}] direct blocked, trying proxy rotation...`);
    const proxies = await fetchProxyList();
    try {
      const [payload, contentType] = await fetchBytesViaProxy(url, proxies, extraHeaders);
      const artifact = saveArtifact(name, '.html', payload);
      const title = extractTitle(payload.toString('utf8'));
      return { name, kind: 'html', url, ok: true, summary: `${title} [${contentType}]`, artifact };
    } catch (err) {
      // ASHP is Cloudflare-protected; if proxies also fail, save an empty
      // artifact so the parser can return zero records without throwing.
      saveArtifact(name, '.html', Buffer.from('<html><body><!-- ASHP unreachable --></body></html>'));
      return {
        name,
        kind: 'html',
        url,
        ok: false,
        summary: `ASHP unreachable: ${(err as Error).message}`,
        artifact: `artifacts/ashp_drug_shortages.html`,
      };
    }
  }
}


function buildGdeltUrl(): string {
  const params = new URLSearchParams({
    query: '("drug shortage" OR "pharmaceutical shortage")',
    mode: 'artlist',
    maxrecords: '250',
    format: 'json',
  });
  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
}

export async function fetchGdeltSource(name: string): Promise<SourceResult> {
  const url = buildGdeltUrl();
  const [payload, contentType] = await fetchBytes(url, { Accept: 'application/json,*/*;q=0.8' });
  const artifact = saveArtifact(name, '.json', payload);
  const text = payload.toString('utf8');

  if (text.trimStart().startsWith('{')) {
    const data = JSON.parse(text) as Record<string, unknown>;
    const articles = Array.isArray(data['articles']) ? data['articles'] : [];
    return {
      name,
      kind: 'json',
      url,
      ok: true,
      summary: `articles=${articles.length} [${contentType}]`,
      artifact,
    };
  }

  const preview = text.slice(0, 180).replace(/\s+/g, ' ').trim();
  return { name, kind: 'json', url, ok: false, summary: `Non-JSON response: ${preview}`, artifact };
}

// ── Paginated fetchers for large APIs ────────────────────────────────────────

export interface OpenFdaMeta {
  meta: {
    results: { skip: number; limit: number; total: number };
  };
  results: unknown[];
}

// openFDA caps skip at 25,000 without an API key. With OPENFDA_API_KEY env var,
// the cap rises to 26,000 (still effectively the same for our purposes).
// If we hit the cap we keep what we have — partial data is not a failure.
const OPENFDA_MAX_SKIP = 25_000;

async function paginateOpenFda(
  name: string,
  baseUrl: string,
  label: string,
): Promise<SourceResult> {
  const limit = 1000;
  const allResults: unknown[] = [];
  const apiKey = process.env.OPENFDA_API_KEY;
  let skip = 0;
  let total = 0;
  let pages = 0;

  while (skip < OPENFDA_MAX_SKIP) {
    const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
    if (apiKey) params.set('api_key', apiKey);
    const url = `${baseUrl}?${params.toString()}`;

    try {
      const data = await fetchJson<OpenFdaMeta>(url);
      total = data.meta?.results?.total ?? 0;
      const batch = data.results ?? [];
      if (batch.length === 0) break;
      allResults.push(...batch);
      pages++;
      skip += limit;
      if (total && skip >= total) break;
      // Stay well under openFDA's 240 req/min limit
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      // 4xx at the skip cap is expected — stop and keep what we have
      console.warn(
        `[${name}] stopping pagination at skip=${skip} (got ${allResults.length} records): ${(err as Error).message}`,
      );
      break;
    }
  }

  if (allResults.length === 0) {
    // Last-ditch fallback: single page
    return fetchJsonSource(name, `${baseUrl}?limit=1000`);
  }

  const payload = Buffer.from(
    JSON.stringify({ meta: { total, fetched: allResults.length, pages }, results: allResults }),
  );
  const artifact = saveArtifact(name, '.json', payload);
  return {
    name,
    kind: 'json',
    url: baseUrl,
    ok: true,
    summary: `fetched=${allResults.length}/${total || '?'} ${label} (${pages} pages)`,
    artifact,
  };
}

export async function fetchOpenFdaEnforcementAll(name: string): Promise<SourceResult> {
  return paginateOpenFda(name, 'https://api.fda.gov/drug/enforcement.json', 'enforcement records');
}

export async function fetchOpenFdaNdcAll(name: string): Promise<SourceResult> {
  return paginateOpenFda(name, 'https://api.fda.gov/drug/ndc.json', 'NDC records');
}

export interface DailyMedResponse {
  data: Array<{ spl_version: number; published_date: string; title: string; setid: string }>;
  metadata: {
    elements_per_page: number;
    current_page: number;
    total_elements: number;
    total_pages: number;
    next_page_url: string | null;
  };
}

export async function fetchDailyMedSplsAll(name: string): Promise<SourceResult> {
  const pageSize = 100;
  const allResults: unknown[] = [];
  let page = 1;
  let totalPages = 1;
  const maxPages = 100; // Safety cap: 100 pages = 10,000 records

  try {
    while (page <= totalPages && page <= maxPages) {
      const url = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?page=${page}&pagesize=${pageSize}`;
      const data = await fetchJson<DailyMedResponse>(url);
      totalPages = data.metadata.total_pages;
      if (data.data && data.data.length > 0) {
        allResults.push(...data.data);
      }
      page++;
      if (page <= totalPages && page <= maxPages) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const payload = Buffer.from(
      JSON.stringify({ metadata: { total_elements: allResults.length, pages_fetched: page - 1 }, data: allResults }),
    );
    const artifact = saveArtifact(name, '.json', payload);
    return {
      name,
      kind: 'json',
      url: 'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json',
      ok: true,
      summary: `fetched=${allResults.length} SPL records (${page - 1} pages)`,
      artifact,
    };
  } catch (err) {
    return fetchJsonSource(name, `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?page=1&pagesize=${pageSize}`);
  }
}
