export interface RecallEvent {
  recallNumber: string;
  product: string;
  reason: string;
  classification: string;
  recallingFirm: string;
  recallDate: string;
  status: string;
  city: string;
  state: string;
  country: string;
  codeInfo: string;
}

export interface NDCRecord {
  productNdc: string;
  genericName: string;
  brandName: string;
  labelerName: string;
  dosageForm: string;
  route: string[];
  activeIngredients: { name: string; strength: string }[];
  pharmClass: string[];
  marketingStartDate: string;
  productType: string;
  packaging: { packageNdc: string; description: string }[];
}

export interface ShortageRecord {
  drugName: string;
  status: string;
  source: 'FDA' | 'ASHP';
  url: string;
  startDate?: string;
  endDate?: string;
}

export interface WarningLetter {
  company: string;
  subject: string;
  issueDate: string;
  postedDate: string;
  issuingOffice: string;
  letterId: string;
  url: string;
}

export interface ImportAlert {
  alertNumber: string;
  product: string;
  firm: string;
  country: string;
  charge: string;
  url: string;
}

export interface Establishment {
  feiNumber: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  operations: string;
}

export interface OrangeBookEntry {
  ingredient: string;
  tradeName: string;
  applicant: string;
  teCode: string;
  type: string;
  rldFlag: string;
}

export interface SPLLabel {
  setId: string;
  title: string;
  publishedDate: string;
  splVersion: number;
  labeler?: string; // extracted from the trailing "[LABELER]" bracket in title
}

export interface NewsSignal {
  title: string;
  url: string;
  seenDate: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

export interface Drug {
  id?: number;
  genericName: string;
  brandNames?: string[] | null;
  activeIngredients?: { name: string; strength: string }[] | null;
  therapeuticClass?: string | null;
}

export interface Manufacturer {
  id?: number;
  name: string;
  normalizedName: string;
}

export interface IngestionResult {
  source: string;
  inserted: number;
  errors: number;
  durationMs: number;
}

export interface RefreshResult {
  startedAt: Date;
  completedAt: Date;
  status: 'success' | 'partial' | 'failed';
  results: IngestionResult[];
  sourcesOk: number;
  sourcesFailed: number;
}

export interface SourceResult {
  name: string;
  kind: string;
  url: string;
  ok: boolean;
  summary: string;
  artifact: string | null;
}
