import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = path.resolve(__dirname, '../../../artifacts');

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 4;

export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Connection: 'keep-alive',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchBytes(
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<[Buffer, string]> {
  const headers = { ...DEFAULT_HEADERS, ...extraHeaders };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get<ArrayBuffer>(url, {
        headers,
        responseType: 'arraybuffer',
        timeout: TIMEOUT_MS,
      });
      const contentType = (response.headers['content-type'] as string) ?? '';
      return [Buffer.from(response.data), contentType];
    } catch (err) {
      lastError = err as Error;
      if (attempt === MAX_RETRIES) throw err;
      await sleep(Math.min(2 ** attempt, 8) * 1000);
    }
  }

  throw lastError!;
}

export async function fetchJson<T = unknown>(url: string, extraHeaders?: Record<string, string>): Promise<T> {
  const [buffer] = await fetchBytes(url, { Accept: 'application/json,*/*;q=0.8', ...extraHeaders });
  return JSON.parse(buffer.toString('utf8')) as T;
}

export async function fetchBytesPost(
  url: string,
  body: string,
  extraHeaders?: Record<string, string>,
): Promise<[Buffer, string]> {
  const headers = { ...DEFAULT_HEADERS, ...extraHeaders };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post<ArrayBuffer>(url, body, {
        headers,
        responseType: 'arraybuffer',
        timeout: TIMEOUT_MS,
      });
      const contentType = (response.headers['content-type'] as string) ?? '';
      return [Buffer.from(response.data), contentType];
    } catch (err) {
      lastError = err as Error;
      if (attempt === MAX_RETRIES) throw err;
      await sleep(Math.min(2 ** attempt, 8) * 1000);
    }
  }

  throw lastError!;
}

export function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return 'No title found';
  return match[1].replace(/\s+/g, ' ').trim();
}

export function saveArtifact(name: string, suffix: string, payload: Buffer): string {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const filename = `${safeSlug(name)}${suffix}`;
  const filePath = path.join(ARTIFACTS_DIR, filename);
  fs.writeFileSync(filePath, payload);
  return `artifacts/${filename}`;
}

export function readArtifact(name: string, suffix: string): Buffer {
  const filename = `${safeSlug(name)}${suffix}`;
  const filePath = path.join(ARTIFACTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

export async function fetchProxyList(): Promise<string[]> {
  try {
    const response = await axios.get<string>(
      'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all',
      { responseType: 'text', timeout: 10_000 },
    );
    return (response.data as string)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 30);
  } catch {
    return [];
  }
}

export async function fetchBytesViaProxy(
  url: string,
  proxies: string[],
  extraHeaders?: Record<string, string>,
): Promise<[Buffer, string]> {
  const headers = { ...DEFAULT_HEADERS, ...extraHeaders };
  const originalMax = process.getMaxListeners();
  process.setMaxListeners(proxies.length + 10);

  try {
    for (const proxy of proxies) {
      const parts = proxy.split(':');
      const host = parts[0];
      const port = parseInt(parts[1] ?? '80', 10);
      try {
        const response = await axios.get<ArrayBuffer>(url, {
          headers,
          responseType: 'arraybuffer',
          timeout: 15_000,
          proxy: { protocol: 'http', host, port },
        });
        const contentType = (response.headers['content-type'] as string) ?? '';
        return [Buffer.from(response.data), contentType];
      } catch {
        continue;
      }
    }
  } finally {
    process.setMaxListeners(originalMax);
  }

  throw new Error('All proxies failed for ' + url);
}
