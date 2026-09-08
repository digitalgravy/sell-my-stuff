import {
  bigserial,
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

export const inventoryCategory = pgEnum('inventory_category', [
  'bag',
  'wrap',
  'box',
  'tape',
  'label',
  'other',
]);

export const inventoryUnit = pgEnum('inventory_unit', [
  'each',
  'roll',
  'sheet',
  'metre',
]);

export const inventoryAdjustmentReason = pgEnum('inventory_adjustment_reason', [
  'restock',
  'used_on_item',
  'correction',
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

/**
 * The Build log's single source of truth -- one row per loggable action on
 * an item (an AI call completing, a manual button click, a fact being
 * corrected or confirmed, evidence changing), replacing what used to be six
 * separate tables merged and sorted by timestamp at read time (no stable
 * identity across reads). `sequence` is a global, monotonically increasing
 * counter (assigned at insert time, never recomputed) -- filtered to one
 * item and read in that order it's still a correct, stable, gap-tolerant
 * per-item ordinal, so the Build log can finally number entries in a way
 * that survives reloads and never renumbers existing ones.
 *
 * `kind` is plain text, not a pgEnum, matching `jobs.type` -- this list will
 * keep growing across features and a pgEnum needs its own migration per new
 * value. `sourceTable`/`sourceId` point back at the detailed row for kinds
 * that already have one (an identification run, a fact correction, ...) so
 * the Build log can still show full detail (system prompt, raw response)
 * without duplicating it here; `detail` carries the whole payload for kinds
 * with no separate table of their own (a manual regenerate click, a batch
 * of confirmations).
 */
export const itemEvents = pgTable(
  'item_events',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    sequence: bigserial('sequence', { mode: 'number' }).notNull(),
    kind: text('kind').notNull(),
    sourceTable: text('source_table'),
    sourceId: uuid('source_id'),
    summary: text('summary').notNull(),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('item_events_item_sequence_idx').on(table.itemId, table.sequence),
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
    // Set by the import-time match classifier when it excludes a listing
    // (a bundle, an accessory-only listing, wrong variant, etc.) -- shown
    // in the UI so a human reviewing 60 rows doesn't have to re-read every
    // title to see why. Left null for a manual toggle; that action is
    // self-explanatory (you just clicked it).
    excludedReason: text('excluded_reason'),
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
    // Null between the row being written (right before the request goes to
    // Anthropic) and the response coming back -- lets the Build log show a
    // real "submitted, waiting" entry instead of only ever seeing a call
    // after the fact. completedAt is null on the same window.
    outcome: identificationRunOutcome('outcome'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    response: jsonb('response'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('identification_runs_item_idx').on(table.itemId, table.createdAt),
  ],
);

/**
 * One row per condition-assessment call -- a second, separate vision-model
 * turn run in the same inspect_images job attempt as identification (see
 * ADR/PROJECT_STATUS.md's "Condition/damage/wear assessment": a distinct
 * concern from identity, independently interesting in the Build log, but
 * not (yet) its own queued job type since nothing re-runs it alone). Same
 * pending/resolved and cost-tracking shape as identification_runs.
 */
export const conditionAssessmentRuns = pgTable(
  'condition_assessment_runs',
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
    // Null between the row being written and the response coming back --
    // see identificationRuns.outcome for why.
    outcome: identificationRunOutcome('outcome'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    response: jsonb('response'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('condition_assessment_runs_item_idx').on(table.itemId, table.createdAt),
  ],
);

/**
 * One row per comparable-match classification call (the LLM pass that
 * decides which imported eBay listings are genuine comparable sales, see
 * server/items/comparable-match.ts) -- the same pending/resolved and
 * cost-tracking shape as identification_runs, so both AI call types show up
 * in the Build log and roll up into the same per-item AI cost total.
 */
/**
 * One row per batched answer-resolution call (server/ai/answer-resolution-provider.ts)
 * -- the LLM pass that turns a person's own plain-language answers to
 * clarifying questions about low-confidence facts into clean, confident
 * values. Same pending/resolved and cost-tracking shape as the other three
 * run tables; no jobId/attempt since this is triggered by a direct user
 * action (the "resolve low-confidence facts" modal), not a queued job.
 */
export const answerResolutionRuns = pgTable(
  'answer_resolution_runs',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    answerCount: integer('answer_count').notNull(),
    // Null while the request is in flight -- see identificationRuns.outcome.
    outcome: identificationRunOutcome('outcome'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    response: jsonb('response'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('answer_resolution_runs_item_idx').on(table.itemId, table.createdAt),
  ],
);

/**
 * One row per dimensions/packaging-assessment call -- a third, separate
 * vision-model turn run in the same inspect_images job attempt as
 * identification and condition (see server/ai/dimensions-provider.ts).
 * Same pending/resolved and cost-tracking shape as condition_assessment_runs.
 */
export const dimensionAssessmentRuns = pgTable(
  'dimension_assessment_runs',
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
    // Null between the row being written and the response coming back --
    // see identificationRuns.outcome for why.
    outcome: identificationRunOutcome('outcome'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    response: jsonb('response'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('dimension_assessment_runs_item_idx').on(table.itemId, table.createdAt),
  ],
);

export const matchClassificationRuns = pgTable(
  'match_classification_runs',
  {
    id: uuid('id').primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    listingCount: integer('listing_count').notNull(),
    // Null while the request is in flight -- see identificationRuns.outcome.
    outcome: identificationRunOutcome('outcome'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    response: jsonb('response'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('match_classification_runs_item_idx').on(table.itemId, table.createdAt),
  ],
);

/**
 * A packaging supply the owner keeps on hand (anti-static bags, bubble
 * wrap, boxes, tape, ...) -- not tied to any one item. Stock is only ever
 * changed through inventoryAdjustments below, which keeps a small audit
 * trail (matching this app's existing "log the change" ethos) rather than
 * updating quantityOnHand directly and losing the history.
 */
export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  category: inventoryCategory('category').notNull(),
  unit: inventoryUnit('unit').notNull(),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** One row per stock change -- restocking, manual correction, or (once wired up) being used on a specific item. */
export const inventoryAdjustments = pgTable(
  'inventory_adjustments',
  {
    id: uuid('id').primaryKey(),
    inventoryItemId: uuid('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: inventoryAdjustmentReason('reason').notNull(),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('inventory_adjustments_item_idx').on(table.inventoryItemId, table.createdAt)],
);
