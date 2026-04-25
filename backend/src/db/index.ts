import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from './schema';

const DB_PATH = process.env.DB_PATH ?? './data/drug_shortage.db';

// Ensure directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Initialize tables if they don't exist
export function initDatabase(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS drugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generic_name TEXT NOT NULL,
      brand_names TEXT,
      active_ingredients TEXT,
      therapeutic_class TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ndcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ndc_code TEXT NOT NULL,
      drug_id INTEGER REFERENCES drugs(id),
      labeler TEXT,
      dosage_form TEXT,
      route TEXT,
      package_description TEXT,
      marketing_start_date TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS manufacturers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS establishments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fei_number TEXT,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      operations TEXT,
      manufacturer_id INTEGER REFERENCES manufacturers(id),
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS shortage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drug_id INTEGER REFERENCES drugs(id),
      drug_name TEXT NOT NULL,
      status TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      source TEXT NOT NULL,
      source_url TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS recall_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recall_number TEXT NOT NULL,
      product TEXT NOT NULL,
      reason TEXT,
      classification TEXT,
      recall_date TEXT,
      firm TEXT,
      status TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      code_info TEXT,
      drug_id INTEGER REFERENCES drugs(id),
      manufacturer_id INTEGER REFERENCES manufacturers(id),
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS warning_letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      subject TEXT,
      issue_date TEXT,
      posted_date TEXT,
      issuing_office TEXT,
      letter_id TEXT,
      url TEXT,
      manufacturer_id INTEGER REFERENCES manufacturers(id),
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS import_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_number TEXT NOT NULL,
      product TEXT,
      firm TEXT,
      country TEXT,
      charge TEXT,
      url TEXT,
      manufacturer_id INTEGER REFERENCES manufacturers(id),
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS orange_book_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient TEXT NOT NULL,
      trade_name TEXT,
      applicant TEXT,
      te_code TEXT,
      type TEXT,
      rld_flag TEXT,
      drug_id INTEGER REFERENCES drugs(id),
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS spl_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id TEXT NOT NULL,
      title TEXT,
      effective_date TEXT,
      labeler TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS news_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT,
      publish_date TEXT,
      domain TEXT,
      language TEXT,
      source_country TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS refresh_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      status TEXT NOT NULL,
      sources_ok INTEGER NOT NULL,
      sources_failed INTEGER NOT NULL,
      notes TEXT
    );

    -- Lookup indexes (by name/product/firm etc.)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_drugs_generic_name ON drugs(generic_name);
    CREATE INDEX IF NOT EXISTS idx_ndcs_ndc_code ON ndcs(ndc_code);
    CREATE INDEX IF NOT EXISTS idx_manufacturers_name ON manufacturers(name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturers_normalized ON manufacturers(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_shortage_drug_name ON shortage_records(drug_name);
    CREATE INDEX IF NOT EXISTS idx_recall_product ON recall_events(product);
    CREATE INDEX IF NOT EXISTS idx_recall_firm ON recall_events(firm);
    CREATE INDEX IF NOT EXISTS idx_warning_company ON warning_letters(company);
    CREATE INDEX IF NOT EXISTS idx_orange_ingredient ON orange_book_entries(ingredient);
    CREATE INDEX IF NOT EXISTS idx_spl_set_id ON spl_labels(set_id);

    -- Foreign-key indexes (hot path for agent tool queries — "all X for Y")
    CREATE INDEX IF NOT EXISTS idx_ndcs_drug_id ON ndcs(drug_id);
    CREATE INDEX IF NOT EXISTS idx_shortage_drug_id ON shortage_records(drug_id);
    CREATE INDEX IF NOT EXISTS idx_recall_drug_id ON recall_events(drug_id);
    CREATE INDEX IF NOT EXISTS idx_recall_mfr_id ON recall_events(manufacturer_id);
    CREATE INDEX IF NOT EXISTS idx_warning_mfr_id ON warning_letters(manufacturer_id);
    CREATE INDEX IF NOT EXISTS idx_import_mfr_id ON import_alerts(manufacturer_id);
    CREATE INDEX IF NOT EXISTS idx_establishments_mfr_id ON establishments(manufacturer_id);
    CREATE INDEX IF NOT EXISTS idx_orange_drug_id ON orange_book_entries(drug_id);

    -- Orange Book therapeutic-equivalence lookup (Phase 5 agent tool)
    CREATE INDEX IF NOT EXISTS idx_orange_te_code ON orange_book_entries(te_code);
  `);
}

initDatabase();
