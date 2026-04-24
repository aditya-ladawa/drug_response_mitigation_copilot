import { tool } from 'langchain';
import { z } from 'zod';
import Fuse from 'fuse.js';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  drugs,
  ndcs,
  manufacturers,
  establishments,
  shortageRecords,
  recallEvents,
  warningLetters,
  importAlerts,
  orangeBookEntries,
  splLabels,
  newsSignals,
} from '../../db/schema';
import {
  findDrugByName,
  findManufacturerByName,
  getRiskCluster,
  getSupplyChainGraph,
  serialize,
} from '../graph';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function likePat(q: string): string {
  return `%${q.trim().replace(/%/g, '')}%`;
}

/** Truncate large result arrays so the LLM context doesn't explode. */
function capRows<T>(rows: T[], cap = 25): { truncated: boolean; rows: T[]; total: number } {
  return {
    truncated: rows.length > cap,
    rows: rows.slice(0, cap),
    total: rows.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. searchDrugs — fuzzy lookup by name / ingredient / brand
// ─────────────────────────────────────────────────────────────────────────────

export const searchDrugs = tool(
  async ({ query, limit = 10 }: { query: string; limit?: number }) => {
    const q = normalize(query);
    if (!q) return { drugs: [], note: 'Empty query' };

    // First pass: exact/prefix match on generic name (fast SQL)
    const directHits = db
      .select()
      .from(drugs)
      .where(
        or(
          like(sql`LOWER(${drugs.genericName})`, `${q}%`),
          like(sql`LOWER(${drugs.brandNames})`, `%"${q}%`),
          like(sql`LOWER(${drugs.activeIngredients})`, `%"${q}%`),
        ),
      )
      .limit(100)
      .all();

    // Second pass: fuse.js fuzzy over results if direct hits are sparse
    let results = directHits;
    if (directHits.length < 3) {
      const all = db.select().from(drugs).limit(2000).all();
      const fuse = new Fuse(all, {
        keys: ['genericName', 'brandNames', 'activeIngredients'],
        threshold: 0.3,
        includeScore: true,
      });
      const fuzzy = fuse.search(q).slice(0, limit).map((r) => r.item);
      const seen = new Set(directHits.map((d) => d.id));
      for (const d of fuzzy) if (!seen.has(d.id)) results.push(d);
    }

    const top = results.slice(0, limit).map((d) => ({
      id: d.id,
      genericName: d.genericName,
      brandNames: d.brandNames ?? [],
      activeIngredients: d.activeIngredients ?? [],
      therapeuticClass: d.therapeuticClass,
    }));
    return { query, count: top.length, drugs: top };
  },
  {
    name: 'searchDrugs',
    description:
      'Search the drug catalog by generic name, brand name, or active ingredient. Returns matching drugs with IDs. Use this first to resolve a user-mentioned drug to a canonical entry.',
    schema: z.object({
      query: z.string().describe('Drug name, brand, or ingredient'),
      limit: z.number().int().positive().max(50).optional().default(10),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. searchShortages
// ─────────────────────────────────────────────────────────────────────────────

export const searchShortages = tool(
  async ({ drugName }: { drugName: string }) => {
    const pattern = likePat(drugName);
    const rows = db
      .select()
      .from(shortageRecords)
      .where(like(sql`LOWER(${shortageRecords.drugName})`, pattern.toLowerCase()))
      .limit(50)
      .all();
    const { rows: capped, total, truncated } = capRows(rows, 25);
    return {
      query: drugName,
      total,
      truncated,
      shortages: capped.map((r) => ({
        id: r.id,
        drugName: r.drugName,
        status: r.status,
        source: r.source,
        startDate: r.startDate,
        endDate: r.endDate,
        sourceUrl: r.sourceUrl,
      })),
    };
  },
  {
    name: 'searchShortages',
    description:
      'Find current or historical drug shortage records. Use the generic drug name. Returns status (current/resolved), dates, and source URL.',
    schema: z.object({
      drugName: z.string().describe('Generic drug name (e.g. "Amoxicillin")'),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. searchRecalls
// ─────────────────────────────────────────────────────────────────────────────

export const searchRecalls = tool(
  async ({ query, by = 'drug' }: { query: string; by?: 'drug' | 'manufacturer' }) => {
    const pat = likePat(query).toLowerCase();
    const column = by === 'manufacturer' ? recallEvents.firm : recallEvents.product;
    const rows = db
      .select()
      .from(recallEvents)
      .where(like(sql`LOWER(${column})`, pat))
      .limit(50)
      .all();
    const { rows: capped, total, truncated } = capRows(rows, 20);
    return {
      query,
      by,
      total,
      truncated,
      recalls: capped.map((r) => ({
        id: r.id,
        recallNumber: r.recallNumber,
        product: r.product,
        reason: r.reason,
        classification: r.classification,
        recallDate: r.recallDate,
        firm: r.firm,
        status: r.status,
        location: [r.city, r.state, r.country].filter(Boolean).join(', '),
      })),
    };
  },
  {
    name: 'searchRecalls',
    description:
      'Search FDA drug recall events by product name or by manufacturer/firm name. Returns recall number, reason, classification (Class I/II/III), date, and firm.',
    schema: z.object({
      query: z.string().describe('Drug name or manufacturer/firm name'),
      by: z.enum(['drug', 'manufacturer']).optional().default('drug'),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. searchWarningLetters
// ─────────────────────────────────────────────────────────────────────────────

export const searchWarningLetters = tool(
  async ({ query }: { query: string }) => {
    const pat = likePat(query).toLowerCase();
    const rows = db
      .select()
      .from(warningLetters)
      .where(
        or(
          like(sql`LOWER(${warningLetters.company})`, pat),
          like(sql`LOWER(${warningLetters.subject})`, pat),
        ),
      )
      .limit(30)
      .all();
    const { rows: capped, total, truncated } = capRows(rows, 15);
    return {
      query,
      total,
      truncated,
      letters: capped.map((r) => ({
        id: r.id,
        company: r.company,
        subject: r.subject,
        issueDate: r.issueDate,
        issuingOffice: r.issuingOffice,
        url: r.url,
      })),
    };
  },
  {
    name: 'searchWarningLetters',
    description:
      'Search FDA warning letters by company name or subject text. These are formal regulatory enforcement letters — a strong signal of CGMP/manufacturing violations.',
    schema: z.object({
      query: z.string().describe('Company name or subject keyword'),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. searchImportAlerts
// ─────────────────────────────────────────────────────────────────────────────

export const searchImportAlerts = tool(
  async ({ query }: { query: string }) => {
    const pat = likePat(query).toLowerCase();
    const rows = db
      .select()
      .from(importAlerts)
      .where(
        or(
          like(sql`LOWER(${importAlerts.product})`, pat),
          like(sql`LOWER(${importAlerts.charge})`, pat),
          like(sql`LOWER(${importAlerts.firm})`, pat),
        ),
      )
      .limit(30)
      .all();
    const { rows: capped, total, truncated } = capRows(rows, 15);
    return {
      query,
      total,
      truncated,
      alerts: capped.map((r) => ({
        id: r.id,
        alertNumber: r.alertNumber,
        product: r.product,
        firm: r.firm,
        country: r.country,
        charge: r.charge,
        url: r.url,
      })),
    };
  },
  {
    name: 'searchImportAlerts',
    description:
      'Search FDA import alerts — these block foreign manufacturers from importing to the US. Search by product, firm, or charge text (violation description).',
    schema: z.object({
      query: z.string().describe('Product name, firm, or violation keyword'),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. getDrugDetails — JOIN drug + ndcs + shortages + labels
// ─────────────────────────────────────────────────────────────────────────────

export const getDrugDetails = tool(
  async ({ identifier }: { identifier: string }) => {
    const q = normalize(identifier);
    const drugRow = db
      .select()
      .from(drugs)
      .where(
        or(
          eq(sql`LOWER(${drugs.genericName})`, q),
          like(sql`LOWER(${drugs.genericName})`, `${q}%`),
        ),
      )
      .limit(1)
      .all()[0];
    if (!drugRow) return { error: `Drug not found: ${identifier}` };

    const ndcRows = db.select().from(ndcs).where(eq(ndcs.drugId, drugRow.id)).limit(30).all();
    const shortages = db
      .select()
      .from(shortageRecords)
      .where(eq(shortageRecords.drugId, drugRow.id))
      .limit(10)
      .all();

    // Labels via labeler match to manufacturers of this drug's NDCs
    const labelers = new Set(ndcRows.map((n) => n.labeler).filter(Boolean) as string[]);
    const labels = [...labelers].length
      ? db
          .select()
          .from(splLabels)
          .where(
            or(
              ...[...labelers].slice(0, 5).map((l) =>
                like(sql`LOWER(${splLabels.labeler})`, `%${l.toLowerCase()}%`),
              ),
            ),
          )
          .limit(10)
          .all()
      : [];

    return {
      drug: {
        id: drugRow.id,
        genericName: drugRow.genericName,
        brandNames: drugRow.brandNames ?? [],
        activeIngredients: drugRow.activeIngredients ?? [],
        therapeuticClass: drugRow.therapeuticClass,
      },
      ndcs: ndcRows.slice(0, 10).map((n) => ({
        ndcCode: n.ndcCode,
        labeler: n.labeler,
        dosageForm: n.dosageForm,
        route: n.route,
        marketingStartDate: n.marketingStartDate,
      })),
      ndcCount: ndcRows.length,
      shortages: shortages.map((s) => ({
        status: s.status,
        source: s.source,
        startDate: s.startDate,
        endDate: s.endDate,
      })),
      labels: labels.map((l) => ({
        setId: l.setId,
        title: l.title,
        labeler: l.labeler,
        effectiveDate: l.effectiveDate,
      })),
    };
  },
  {
    name: 'getDrugDetails',
    description:
      'Get full detail for a drug: NDCs, labelers, current/historical shortages, and SPL labels. Use after searchDrugs locates the canonical entry.',
    schema: z.object({
      identifier: z.string().describe('Generic name of the drug'),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. getManufacturerProfile
// ─────────────────────────────────────────────────────────────────────────────

export const getManufacturerProfile = tool(
  async ({ name }: { name: string }) => {
    const q = normalize(name);
    const mfrRow = db
      .select()
      .from(manufacturers)
      .where(
        or(
          like(sql`LOWER(${manufacturers.name})`, `%${q}%`),
          like(sql`LOWER(${manufacturers.normalizedName})`, `%${q}%`),
        ),
      )
      .limit(1)
      .all()[0];
    if (!mfrRow) return { error: `Manufacturer not found: ${name}` };

    const ests = db
      .select()
      .from(establishments)
      .where(eq(establishments.manufacturerId, mfrRow.id))
      .limit(25)
      .all();
    const warnings = db
      .select()
      .from(warningLetters)
      .where(eq(warningLetters.manufacturerId, mfrRow.id))
      .limit(10)
      .all();
    const imports = db
      .select()
      .from(importAlerts)
      .where(eq(importAlerts.manufacturerId, mfrRow.id))
      .limit(10)
      .all();
    const recalls = db
      .select()
      .from(recallEvents)
      .where(eq(recallEvents.manufacturerId, mfrRow.id))
      .limit(15)
      .all();

    return {
      manufacturer: { id: mfrRow.id, name: mfrRow.name, normalizedName: mfrRow.normalizedName },
      establishments: ests.map((e) => ({
        feiNumber: e.feiNumber,
        name: e.name,
        city: e.city,
        state: e.state,
        country: e.country,
        operations: e.operations,
      })),
      warningLetters: warnings.map((w) => ({
        subject: w.subject,
        issueDate: w.issueDate,
        url: w.url,
      })),
      importAlerts: imports.map((a) => ({
        alertNumber: a.alertNumber,
        product: a.product,
        charge: a.charge,
        url: a.url,
      })),
      recalls: recalls.map((r) => ({
        recallNumber: r.recallNumber,
        product: r.product,
        classification: r.classification,
        reason: r.reason,
        recallDate: r.recallDate,
      })),
      counts: {
        establishments: ests.length,
        warningLetters: warnings.length,
        importAlerts: imports.length,
        recalls: recalls.length,
      },
    };
  },
  {
    name: 'getManufacturerProfile',
    description:
      'Get a manufacturer profile: its plants/establishments (with locations), warning letters received, import alerts, and recall history. Use to assess regulatory risk of a firm.',
    schema: z.object({
      name: z.string().describe('Manufacturer name (fuzzy matched)'),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. getTherapeuticAlternatives — Orange Book AB-rated substitutes
// ─────────────────────────────────────────────────────────────────────────────

export const getTherapeuticAlternatives = tool(
  async ({ drugName }: { drugName: string }) => {
    const q = normalize(drugName);
    // Resolve to canonical drug
    const drugRow = db
      .select()
      .from(drugs)
      .where(
        or(
          eq(sql`LOWER(${drugs.genericName})`, q),
          like(sql`LOWER(${drugs.genericName})`, `${q}%`),
        ),
      )
      .limit(1)
      .all()[0];
    if (!drugRow) return { error: `Drug not found: ${drugName}` };

    // Orange Book entries for this drug — group by TE code
    const entries = db
      .select()
      .from(orangeBookEntries)
      .where(eq(orangeBookEntries.drugId, drugRow.id))
      .limit(100)
      .all();

    // AB-rated = therapeutically equivalent. Also A*, which means bioequivalent
    const teRated = entries.filter((e) => e.teCode && /^A/i.test(e.teCode));
    const alternatives = teRated.map((e) => ({
      ingredient: e.ingredient,
      tradeName: e.tradeName,
      applicant: e.applicant,
      teCode: e.teCode,
      type: e.type,
      rldFlag: e.rldFlag,
    }));

    // Also include other NDC-level products from same generic (alternative labelers)
    const otherLabelers = db
      .select({
        ndcCode: ndcs.ndcCode,
        labeler: ndcs.labeler,
        dosageForm: ndcs.dosageForm,
        route: ndcs.route,
      })
      .from(ndcs)
      .where(eq(ndcs.drugId, drugRow.id))
      .limit(20)
      .all();

    return {
      drug: drugRow.genericName,
      teCodesFound: [...new Set(teRated.map((e) => e.teCode))].filter(Boolean),
      therapeuticEquivalents: alternatives.slice(0, 25),
      alternativeNdcProducts: otherLabelers.slice(0, 10),
      note:
        alternatives.length === 0
          ? 'No Orange Book TE-rated alternatives found for this drug ID. The agent may want to search by active ingredient via searchDrugs to find a related entry.'
          : undefined,
    };
  },
  {
    name: 'getTherapeuticAlternatives',
    description:
      'Find FDA Orange Book therapeutically equivalent (AB-rated) alternatives to a drug. Also returns alternative NDC products. Use for substitution recommendations.',
    schema: z.object({
      drugName: z.string().describe('Generic name of the drug in shortage'),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. getSupplyChainGraph — force-graph ready JSON
// ─────────────────────────────────────────────────────────────────────────────

export const getSupplyChainGraphTool = tool(
  async ({ drugName, depth = 2 }: { drugName: string; depth?: number }) => {
    const node = findDrugByName(drugName);
    if (!node) return { error: `Drug node not found in graph: ${drugName}` };
    const dbId = parseInt(node.id.split(':')[1], 10);
    const sub = getSupplyChainGraph(dbId, depth);
    const serialized = serialize(sub);
    // Summarize for the LLM (the raw graph goes to the UI via SSE separately)
    const byType: Record<string, number> = {};
    for (const n of serialized.nodes) {
      const t = (n as { type?: string }).type ?? 'unknown';
      byType[t] = (byType[t] ?? 0) + 1;
    }
    return {
      drug: node.genericName ?? drugName,
      depth,
      rootId: serialized.rootId,
      nodeCount: serialized.nodes.length,
      linkCount: serialized.links.length,
      nodesByType: byType,
      // Full graph included for the UI-facing tool result
      graph: serialized,
    };
  },
  {
    name: 'getSupplyChainGraph',
    description:
      'Build a supply-chain subgraph around a drug: its ingredients, NDCs, manufacturers, plants, warnings, recalls. Returns a summary plus a force-graph-ready structure. Depth 2 is the default.',
    schema: z.object({
      drugName: z.string(),
      depth: z.number().int().min(1).max(4).optional().default(2),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 9b. getManufacturerRiskCluster — what drugs/plants depend on this mfr
// ─────────────────────────────────────────────────────────────────────────────

export const getManufacturerRiskCluster = tool(
  async ({ manufacturerName }: { manufacturerName: string }) => {
    const node = findManufacturerByName(manufacturerName);
    if (!node) return { error: `Manufacturer not in graph: ${manufacturerName}` };
    const dbId = parseInt(node.id.split(':')[1], 10);
    const cluster = getRiskCluster(dbId);
    return {
      manufacturer: cluster.mfr?.name ?? manufacturerName,
      counts: {
        drugs: cluster.drugs.length,
        establishments: cluster.establishments.length,
        warnings: cluster.warnings.length,
        importAlerts: cluster.importAlerts.length,
        recalls: cluster.recalls.length,
      },
      drugs: cluster.drugs.slice(0, 20).map((d) => ({
        name: (d as { genericName?: string }).genericName,
        id: d.id,
      })),
      establishments: cluster.establishments.slice(0, 15).map((e) => ({
        name: (e as { name?: string }).name,
        city: (e as { city?: string }).city,
        country: (e as { country?: string }).country,
      })),
      warnings: cluster.warnings.slice(0, 5).map((w) => ({
        subject: (w as { subject?: string }).subject,
        date: (w as { issueDate?: string }).issueDate,
      })),
    };
  },
  {
    name: 'getManufacturerRiskCluster',
    description:
      'Assess downstream impact of a manufacturer: which drugs, plants, warnings, alerts, and recalls cluster around it. Use in risk-propagation to find co-exposed drugs.',
    schema: z.object({
      manufacturerName: z.string(),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 10. searchNews — GDELT news_signals table
// ─────────────────────────────────────────────────────────────────────────────

export const searchNews = tool(
  async ({ query, limit = 15 }: { query: string; limit?: number }) => {
    const pat = likePat(query).toLowerCase();
    const rows = db
      .select()
      .from(newsSignals)
      .where(like(sql`LOWER(${newsSignals.title})`, pat))
      .limit(limit)
      .all();
    return {
      query,
      count: rows.length,
      articles: rows.map((r) => ({
        title: r.title,
        url: r.url,
        publishDate: r.publishDate,
        domain: r.domain,
        language: r.language,
        sourceCountry: r.sourceCountry,
      })),
    };
  },
  {
    name: 'searchNews',
    description:
      'Search the local news corpus (GDELT-indexed articles about drug shortages and pharmaceutical supply issues). Returns title, URL, date, source domain.',
    schema: z.object({
      query: z.string().describe('Keyword or drug name'),
      limit: z.number().int().positive().max(30).optional().default(15),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 11. getTimeline — multi-table chronological merge
// ─────────────────────────────────────────────────────────────────────────────

export const getTimeline = tool(
  async ({ drugName }: { drugName: string }) => {
    const q = normalize(drugName);
    const drugRow = db
      .select()
      .from(drugs)
      .where(
        or(
          eq(sql`LOWER(${drugs.genericName})`, q),
          like(sql`LOWER(${drugs.genericName})`, `${q}%`),
        ),
      )
      .limit(1)
      .all()[0];

    type TimelineEvent = {
      date: string;
      type: 'shortage' | 'recall' | 'warning_letter' | 'import_alert' | 'news';
      title: string;
      detail: string;
      url?: string;
    };
    const events: TimelineEvent[] = [];

    if (drugRow) {
      const shortages = db
        .select()
        .from(shortageRecords)
        .where(eq(shortageRecords.drugId, drugRow.id))
        .all();
      for (const s of shortages) {
        if (s.startDate) {
          events.push({
            date: s.startDate,
            type: 'shortage',
            title: `${s.drugName} shortage (${s.status})`,
            detail: `Source: ${s.source}`,
            url: s.sourceUrl ?? undefined,
          });
        }
      }
      const recalls = db
        .select()
        .from(recallEvents)
        .where(eq(recallEvents.drugId, drugRow.id))
        .all();
      for (const r of recalls) {
        if (r.recallDate) {
          events.push({
            date: r.recallDate,
            type: 'recall',
            title: `Recall: ${r.product}`,
            detail: `${r.classification ?? ''} — ${r.reason ?? ''} (Firm: ${r.firm ?? 'unknown'})`,
          });
        }
      }
    }

    // News — title-matched
    const news = db
      .select()
      .from(newsSignals)
      .where(like(sql`LOWER(${newsSignals.title})`, likePat(drugName).toLowerCase()))
      .all();
    for (const n of news) {
      if (n.publishDate) {
        events.push({
          date: n.publishDate,
          type: 'news',
          title: n.title,
          detail: `${n.domain ?? ''}`,
          url: n.url ?? undefined,
        });
      }
    }

    events.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
    return {
      drug: drugRow?.genericName ?? drugName,
      eventCount: events.length,
      events: events.slice(0, 40),
    };
  },
  {
    name: 'getTimeline',
    description:
      'Produce a chronological timeline of events for a drug: shortages, recalls, news articles. Newest-first. Use to narrate how a shortage unfolded.',
    schema: z.object({
      drugName: z.string(),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool registry — grouped for main agent vs. specialist subagents
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_TOOLS = [
  searchDrugs,
  searchShortages,
  searchRecalls,
  searchWarningLetters,
  searchImportAlerts,
  getDrugDetails,
  getManufacturerProfile,
  getTherapeuticAlternatives,
  getSupplyChainGraphTool,
  getManufacturerRiskCluster,
  searchNews,
  getTimeline,
];

export const RISK_TOOLS = [
  getSupplyChainGraphTool,
  getManufacturerRiskCluster,
  getManufacturerProfile,
  getDrugDetails,
];

export const MITIGATION_TOOLS = [
  getTherapeuticAlternatives,
  getManufacturerProfile,
  getDrugDetails,
  searchShortages,
];

export const SCENARIO_TOOLS = [
  getSupplyChainGraphTool,
  getManufacturerRiskCluster,
  getManufacturerProfile,
];
