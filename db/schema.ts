import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const itemStatus = pgEnum('item_status', [
  'INBOX',
  'IDENTIFYING',
  'NEEDS_INFORMATION',
  'RESEARCHING',
  'VALUING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'LIVE',
  'SOLD',
  'AWAITING_DISPATCH',
  'DISPATCHED',
  'COMPLETE',
  'FAILED',
]);

export const photoStatus = pgEnum('photo_status', [
  'UPLOADED',
  'INSPECTING',
  'READY',
  'REJECTED',
]);

export const jobState = pgEnum('job_state', [
  'QUEUED',
  'RUNNING',
  'WAITING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export const factOrigin = pgEnum('fact_origin', [
  'user_evidence',
  'image_inference',
  'web_research',
  'manufacturer_data',
  'user_confirmed',
]);

export const identificationRunOutcome = pgEnum('identification_run_outcome', [
  'succeeded',
  'failed',
]);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey(),
    title: text('title').notNull().default('Untitled item'),
    status: itemStatus('status').notNull().default('INBOX'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('items_status_created_idx').on(table.status, table.createdAt),
  ],
);

export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull(),
    mediaType: text('media_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    position: integer('position').notNull(),
    status: photoStatus('status').notNull().default('UPLOADED'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('photos_object_key_unique').on(table.objectKey),
    uniqueIndex('photos_item_position_unique').on(table.itemId, table.position),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    state: jobState('state').notNull().default('QUEUED'),
    idempotencyKey: text('idempotency_key').notNull(),
    attempt: integer('attempt').notNull().default(0),
    progress: integer('progress').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('jobs_idempotency_key_unique').on(table.idempotencyKey),
    index('jobs_state_created_idx').on(table.state, table.createdAt),
  ],
);

export const itemFacts = pgTable(
  'item_facts',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    value: text('value').notNull(),
    confidence: real('confidence').notNull(),
    origin: factOrigin('origin').notNull(),
    evidence: text('evidence'),
    source: text('source'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    userConfirmed: boolean('user_confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('item_facts_item_idx').on(table.itemId),
    uniqueIndex('item_facts_item_field_unique').on(table.itemId, table.field),
  ],
);

/**
 * One row per user correction to a fact -- captures the prior value (null
 * if the field didn't exist yet) so a correction can be undone exactly,
 * and surfaced as its own Build log entry the same way a comparable-sales
 * import is. `revertedAt` set means undone; it then drops out of the log,
 * matching how an undone import disappears rather than showing "undone".
 */
export const factCorrections = pgTable(
  'fact_corrections',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    previousValue: text('previous_value'),
    previousOrigin: factOrigin('previous_origin'),
    newValue: text('new_value').notNull(),
    correctedAt: timestamp('corrected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revertedAt: timestamp('reverted_at', { withTimezone: true }),
  },
  (table) => [index('fact_corrections_item_idx').on(table.itemId)],
);

/**
 * A raw eBay results page, captured by the bookmarklet (see
 * app/tools/capture) from the user's own real desktop browser rather
 * than the automated sell-browser service -- eBay's own anti-bot
 * detection treats a Playwright-controlled browser differently from a
 * genuine one even under identical, human-driven actions (confirmed
 * live 2026-09-06), so this is the reliable path for comparable-sale
 * research. extractedSales is computed once at capture time (not
 * re-parsed on every list view) and consumed -- the row is deleted --
 * once successfully imported onto an item via comparable_sales.
 */
export const researchCaptures = pgTable('research_captures', {
  id: uuid('id').primaryKey(),
  sourceUrl: text('source_url'),
  pageTitle: text('page_title'),
  html: text('html').notNull(),
  extractedSales: jsonb('extracted_sales').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Set together on import, cleared together on undo -- a capture with
  // importedIntoItemId set is excluded from the pending-captures inbox,
  // but (unlike the old delete-on-import behaviour) its row and raw html
  // survive so undo can restore it to pending rather than losing it.
  importedAt: timestamp('imported_at', { withTimezone: true }),
  importedIntoItemId: uuid('imported_into_item_id').references(() => items.id, {
    onDelete: 'set null',
  }),
});

/** One row per comparable sale imported onto an item -- see ComparableSale in server/items/item-detail-repository.ts. */
export const comparableSales = pgTable(
  'comparable_sales',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    match: text('match').notNull(),
    soldAt: text('sold_at').notNull(),
    price: real('price').notNull(),
    excluded: boolean('excluded').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Which capture this row came from, so an accidental import can be
    // undone by deleting exactly the rows it added -- null for rows added
    // any other way in the future.
    sourceCaptureId: uuid('source_capture_id').references(() => researchCaptures.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [index('comparable_sales_item_idx').on(table.itemId)],
);

/**
 * One row per inspect_images attempt (a "build log" for identification
 * runs) -- unlike item_facts, which keeps only the current derived value
 * per field, this records the full raw model response (every candidate,
 * not just the leading one) and per-run cost, whether it succeeded or
 * failed. See ADR 0007: "record model, approximate cost and evidence
 * lineage".
 */
export const identificationRuns = pgTable(
  'identification_runs',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    outcome: identificationRunOutcome('outcome').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    response: jsonb('response'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('identification_runs_item_idx').on(table.itemId, table.createdAt),
  ],
);
