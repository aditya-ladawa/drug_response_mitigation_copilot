export interface SourceResult {
  name: string;
  kind: string;
  url: string;
  ok: boolean;
  summary: string;
  artifact: string | null;
}
