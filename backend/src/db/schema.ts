import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const drugs = sqliteTable('drugs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  genericName: text('generic_name').notNull(),
  brandNames: text('brand_names', { mode: 'json' }).$type<string[]>(),
  activeIngredients: text('active_ingredients', { mode: 'json' }).$type<{ name: string; strength: string }[]>(),
  therapeuticClass: text('therapeutic_class'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const ndcs = sqliteTable('ndcs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ndcCode: text('ndc_code').notNull(),
  drugId: integer('drug_id').references(() => drugs.id),
  labeler: text('labeler'),
  dosageForm: text('dosage_form'),
  route: text('route', { mode: 'json' }).$type<string[]>(),
  packageDescription: text('package_description'),
  marketingStartDate: text('marketing_start_date'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const manufacturers = sqliteTable('manufacturers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const establishments = sqliteTable('establishments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feiNumber: text('fei_number'),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  operations: text('operations'),
  manufacturerId: integer('manufacturer_id').references(() => manufacturers.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const shortageRecords = sqliteTable('shortage_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  drugId: integer('drug_id').references(() => drugs.id),
  drugName: text('drug_name').notNull(),
  status: text('status').notNull(),
  startDate: text('start_date'),
  endDate: text('end_date'),
  source: text('source').notNull(), // 'FDA' | 'ASHP'
  sourceUrl: text('source_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const recallEvents = sqliteTable('recall_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recallNumber: text('recall_number').notNull(),
  product: text('product').notNull(),
  reason: text('reason'),
  classification: text('classification'),
  recallDate: text('recall_date'),
  firm: text('firm'),
  status: text('status'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  codeInfo: text('code_info'),
  drugId: integer('drug_id').references(() => drugs.id),
  manufacturerId: integer('manufacturer_id').references(() => manufacturers.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const warningLetters = sqliteTable('warning_letters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  company: text('company').notNull(),
  subject: text('subject'),
  issueDate: text('issue_date'),
  postedDate: text('posted_date'),
  issuingOffice: text('issuing_office'),
  letterId: text('letter_id'),
  url: text('url'),
  manufacturerId: integer('manufacturer_id').references(() => manufacturers.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const importAlerts = sqliteTable('import_alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  alertNumber: text('alert_number').notNull(),
  product: text('product'),
  firm: text('firm'),
  country: text('country'),
  charge: text('charge'),
  url: text('url'),
  manufacturerId: integer('manufacturer_id').references(() => manufacturers.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const orangeBookEntries = sqliteTable('orange_book_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ingredient: text('ingredient').notNull(),
  tradeName: text('trade_name'),
  applicant: text('applicant'),
  teCode: text('te_code'),
  type: text('type'),
  rldFlag: text('rld_flag'),
  drugId: integer('drug_id').references(() => drugs.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const splLabels = sqliteTable('spl_labels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  setId: text('set_id').notNull(),
  title: text('title'),
  effectiveDate: text('effective_date'),
  labeler: text('labeler'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const newsSignals = sqliteTable('news_signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url'),
  publishDate: text('publish_date'),
  domain: text('domain'),
  language: text('language'),
  sourceCountry: text('source_country'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const refreshLog = sqliteTable('refresh_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status').notNull(), // 'running' | 'success' | 'partial' | 'failed'
  sourcesOk: integer('sources_ok').notNull(),
  sourcesFailed: integer('sources_failed').notNull(),
  notes: text('notes'),
});
