import {
  boolean,
  index,
  integer,
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
