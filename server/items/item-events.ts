import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type * as schema from '@/db/schema';
import { itemEvents } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

/**
 * Every kind of thing that can appear in the Build log. Plain string union,
 * not a pgEnum -- see item_events' doc comment in db/schema.ts.
 */
export const ITEM_EVENT_KIND = {
  IDENTIFICATION_RUN: 'identification_run',
  CONDITION_RUN: 'condition_run',
  MATCH_RUN: 'match_run',
  COMPARABLE_SALES_IMPORTED: 'comparable_sales_imported',
  EBAY_SEARCH_PREPARED: 'ebay_search_prepared',
  RESEARCH_FAILED: 'research_failed',
  RESEARCH_REGENERATED: 'research_regenerated',
  IDENTIFICATION_RETRIED: 'identification_retried',
  FACT_CORRECTED: 'fact_corrected',
  FACT_CONFIRMED: 'fact_confirmed',
  SALE_EXCLUDED_TOGGLED: 'sale_excluded_toggled',
} as const;

export type ItemEventKind = (typeof ITEM_EVENT_KIND)[keyof typeof ITEM_EVENT_KIND];

export interface LogItemEventInput {
  itemId: string;
  /** One of ITEM_EVENT_KIND's values in practice, but plain `string` here too -- see item_events' doc comment in db/schema.ts on why `kind` isn't a closed enum. */
  kind: string;
  summary: string;
  /** Points back at the detailed row for kinds that have one (an identification run, a fact correction, ...) -- lets the Build log join for full detail instead of duplicating it here. */
  sourceTable?: string;
  sourceId?: string;
  /** The whole payload for kinds with no separate table of their own (a manual click, a batch of changes). */
  detail?: unknown;
}

/** Anything with `.insert`/`.delete` bound to the app's schema -- the main database handle or a transaction, so callers already inside a `database.transaction(...)` can log atomically with their real write. */
type EventLoggableDb = Pick<PostgresJsDatabase<typeof schema>, 'insert' | 'delete'>;

/** Inserted once per loggable action -- see item_events' doc comment in db/schema.ts for why this exists instead of deriving the Build log from six separate tables. */
export async function logItemEvent(
  input: LogItemEventInput,
  db: EventLoggableDb = getDatabase(),
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(itemEvents).values({
    id,
    itemId: input.itemId,
    kind: input.kind,
    sourceTable: input.sourceTable,
    sourceId: input.sourceId,
    summary: input.summary,
    detail: input.detail,
  });
  return { id };
}

/**
 * Removes the event(s) logged against a specific source row -- used when
 * the underlying action is undone (a capture import), matching
 * fact_corrections' own revert-hides-from-the-log behaviour rather than
 * leaving a stale "imported" entry for something no longer true.
 */
export async function deleteItemEventBySource(
  sourceTable: string,
  sourceId: string,
  db: EventLoggableDb = getDatabase(),
): Promise<void> {
  await db
    .delete(itemEvents)
    .where(and(eq(itemEvents.sourceTable, sourceTable), eq(itemEvents.sourceId, sourceId)));
}
