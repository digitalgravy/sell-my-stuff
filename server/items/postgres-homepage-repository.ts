import { and, desc, eq, inArray } from 'drizzle-orm';

import { itemFacts, items, jobs } from '@/db/schema';
import { getDatabase } from '@/server/db/client';
import { INSPECT_IMAGES_JOB_TYPE } from '@/server/jobs/inspect-images-job';

import type {
  HomepageItemFacts,
  HomepageItemRow,
  HomepageRepository,
} from './homepage-repository';
import type { ItemStatusValue } from './research-repository';

// The only statuses any worker currently transitions an item into or leaves
// it in (see inspect-images-job.ts); later stages (VALUING, READY_FOR_REVIEW,
// ...) aren't reachable yet and are intentionally excluded rather than shown
// as permanently "active" with nothing behind them.
const ACTIVE_STATUSES: ItemStatusValue[] = [
  'INBOX',
  'IDENTIFYING',
  'NEEDS_INFORMATION',
  'RESEARCHING',
  'FAILED',
];

const DISPLAY_FACT_FIELDS = [
  'identity.item_type',
  'identity.manufacturer',
  'identity.model',
  'identity.open_questions',
] as const;

export class PostgresHomepageRepository implements HomepageRepository {
  async listActiveItems(): Promise<HomepageItemRow[]> {
    const database = getDatabase();

    const itemRows = await database
      .select({ id: items.id, status: items.status, updatedAt: items.updatedAt })
      .from(items)
      .where(inArray(items.status, ACTIVE_STATUSES))
      .orderBy(desc(items.updatedAt));
    if (itemRows.length === 0) return [];

    const factRows = await database
      .select({
        itemId: itemFacts.itemId,
        field: itemFacts.field,
        value: itemFacts.value,
      })
      .from(itemFacts)
      .where(
        and(
          inArray(
            itemFacts.itemId,
            itemRows.map((row) => row.id),
          ),
          inArray(itemFacts.field, DISPLAY_FACT_FIELDS),
        ),
      );

    const factsByItem = new Map<string, HomepageItemFacts>();
    for (const row of factRows) {
      const entry = factsByItem.get(row.itemId) ?? { openQuestions: [] };
      switch (row.field) {
        case 'identity.item_type':
          entry.itemType = parseString(row.value);
          break;
        case 'identity.manufacturer':
          entry.manufacturer = parseString(row.value);
          break;
        case 'identity.model':
          entry.model = parseString(row.value);
          break;
        case 'identity.open_questions':
          entry.openQuestions = parseStringArray(row.value);
          break;
      }
      factsByItem.set(row.itemId, entry);
    }

    const failedItemIds = itemRows
      .filter((row) => row.status === 'FAILED')
      .map((row) => row.id);
    const lastErrorByItem = await this.#loadLastErrors(database, failedItemIds);

    return itemRows.map((row) => ({
      id: row.id,
      status: row.status,
      updatedAt: row.updatedAt,
      facts: factsByItem.get(row.id) ?? { openQuestions: [] },
      lastError: lastErrorByItem.get(row.id),
    }));
  }

  /** Most recent inspect_images job's error per item, for FAILED items only. */
  async #loadLastErrors(
    database: ReturnType<typeof getDatabase>,
    itemIds: string[],
  ): Promise<Map<string, string>> {
    if (itemIds.length === 0) return new Map();

    const rows = await database
      .select({
        itemId: jobs.itemId,
        lastError: jobs.lastError,
      })
      .from(jobs)
      .where(
        and(
          inArray(jobs.itemId, itemIds),
          eq(jobs.type, INSPECT_IMAGES_JOB_TYPE),
        ),
      )
      .orderBy(desc(jobs.updatedAt));

    const lastErrorByItem = new Map<string, string>();
    for (const row of rows) {
      if (!lastErrorByItem.has(row.itemId) && row.lastError) {
        lastErrorByItem.set(row.itemId, row.lastError);
      }
    }
    return lastErrorByItem;
  }
}

function parseString(rawValue: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(rawValue);
    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseStringArray(rawValue: string): string[] {
  try {
    const parsed: unknown = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}
