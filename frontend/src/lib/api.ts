import type { SourceResult } from '../types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '/api';

export async function fetchDataSources(): Promise<SourceResult[]> {
  const res = await fetch(`${BACKEND_URL}/data-sources`);
  if (!res.ok) throw new Error(`Failed to fetch data sources: ${res.statusText}`);
  const data = (await res.json()) as { results: SourceResult[] };
  return data.results;
}
