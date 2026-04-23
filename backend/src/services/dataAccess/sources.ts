import JSZip from 'jszip';
import { URLSearchParams } from 'url';
import { SourceResult } from '../../types';
import {
  extractTitle,
  fetchBytes,
  fetchBytesPost,
  fetchBytesViaProxy,
  fetchProxyList,
  saveArtifact,
} from './fetcher';

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
  const zip = await JSZip.loadAsync(payload);
  const members = Object.keys(zip.files);
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

export async function fetchImportAlertSearch(name: string): Promise<SourceResult> {
  const url = 'https://www.accessdata.fda.gov/scripts/importalertsearch/searchResults.cfm';
  const body = new URLSearchParams({
    query: 'drug',
    start: '0',
    rows: '5',
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
  const url = 'https://www.ashp.org/drug-shortages/current-shortages';
  const extraHeaders = {
    Referer: 'https://www.ashp.org/',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'document',
  };

  // Try direct first
  try {
    return await fetchHtmlWithHeaders(name, url, extraHeaders);
  } catch {
    // fall through to proxy rotation
  }

  console.log(`  [${name}] direct blocked, trying proxy rotation...`);
  const proxies = await fetchProxyList();
  const [payload, contentType] = await fetchBytesViaProxy(url, proxies, extraHeaders);
  const artifact = saveArtifact(name, '.html', payload);
  const title = extractTitle(payload.toString('utf8'));
  return { name, kind: 'html', url, ok: true, summary: `${title} [${contentType}]`, artifact };
}

export async function fetchCmsDatasetJson(name: string, url: string): Promise<SourceResult> {
  const [payload, contentType] = await fetchBytes(url, { Accept: 'application/json,*/*;q=0.8' });
  const artifact = saveArtifact(name, '.json', payload);
  const data: unknown = JSON.parse(payload.toString('utf8'));
  const rows = Array.isArray(data) ? data.length : 'n/a';
  return { name, kind: 'json', url, ok: true, summary: `rows=${rows} [${contentType}]`, artifact };
}

export async function fetchCmsCatalog(name: string, url: string): Promise<SourceResult> {
  const [payload, contentType] = await fetchBytes(url, { Accept: 'application/json,*/*;q=0.8' });
  const artifact = saveArtifact(name, '.json', payload);
  const data: unknown = JSON.parse(payload.toString('utf8'));
  const datasetCount =
    typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>)['dataset'])
      ? ((data as Record<string, unknown>)['dataset'] as unknown[]).length
      : 'n/a';
  return {
    name,
    kind: 'json',
    url,
    ok: true,
    summary: `datasets=${datasetCount} [${contentType}]`,
    artifact,
  };
}

function buildGdeltUrl(): string {
  const params = new URLSearchParams({
    query: '("drug shortage" OR "pharmaceutical shortage")',
    mode: 'artlist',
    maxrecords: '5',
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
