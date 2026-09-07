import { and, desc, eq, inArray } from 'drizzle-orm';

import { comparableSales, itemFacts, items, jobs } from '@/db/schema';
import { getDatabase } from '@/server/db/client';
import { INSPECT_IMAGES_JOB_TYPE } from '@/server/jobs/inspect-images-job';

import type { ComparableSale } from './item-detail-repository';
import type {
  HomepageItemFacts,
  HomepageItemRow,
  HomepageRepository,
  JobStateValue,
} from './homepage-repository';
import type { ItemStatusValue } from './research-repository';
import { computeValuation } from './valuation';

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
  'research.ebay_search_url',
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
        case 'research.ebay_search_url':
          entry.ebaySearchUrl = parseString(row.value);
          break;
      }
      factsByItem.set(row.itemId, entry);
    }

    const jobInfoByItem = await this.#loadJobInfo(
      database,
      itemRows.map((row) => row.id),
    );
    const itemIdsWithEvidence = await this.#loadItemIdsWithEvidence(
      database,
      itemRows.map((row) => row.id),
    );

    return itemRows.map((row) => ({
      id: row.id,
      status: row.status,
      updatedAt: row.updatedAt,
      facts: factsByItem.get(row.id) ?? { openQuestions: [] },
      jobState: jobInfoByItem.get(row.id)?.state,
      lastError: jobInfoByItem.get(row.id)?.lastError,
      hasEvidence: itemIdsWithEvidence.has(row.id),
    }));
  }

  async getOutcomeCounts(): Promise<{
    live: number;
    cleared: number;
    realisedTotal: number;
    estimatedValueTotal: number;
  }> {
    const database = getDatabase();
    const [liveRows, clearedRows, activeItemRows] = await Promise.all([
      database.select({ id: items.id }).from(items).where(eq(items.status, 'LIVE')),
      database
        .select({ id: items.id })
        .from(items)
        .where(inArray(items.status, ['SOLD', 'COMPLETE'])),
      database.select({ id: items.id }).from(items).where(inArray(items.status, ACTIVE_STATUSES)),
    ]);

    const estimatedValueTotal = await this.#sumEstimatedValue(
      database,
      activeItemRows.map((row) => row.id),
    );

    return {
      live: liveRows.length,
      cleared: clearedRows.length,
      // No sale-price field exists anywhere in the schema yet -- honestly
      // always 0 until a real sale-recording flow exists to sum.
      realisedTotal: 0,
      estimatedValueTotal,
    };
  }

  async #sumEstimatedValue(
    database: ReturnType<typeof getDatabase>,
    itemIds: string[],
  ): Promise<number> {
    if (itemIds.length === 0) return 0;
    const saleRows = await database
      .select({
        itemId: comparableSales.itemId,
        title: comparableSales.title,
        match: comparableSales.match,
        soldAt: comparableSales.soldAt,
        price: comparableSales.price,
        excluded: comparableSales.excluded,
      })
      .from(comparableSales)
      .where(inArray(comparableSales.itemId, itemIds));

    const salesByItem = new Map<string, ComparableSale[]>();
    for (const row of saleRows) {
      const list = salesByItem.get(row.itemId) ?? [];
      list.push({
        title: row.title,
        match: row.match,
        soldAt: row.soldAt,
        price: row.price,
        excluded: row.excluded,
      });
      salesByItem.set(row.itemId, list);
    }

    let total = 0;
    for (const sales of salesByItem.values()) {
      const pricing = computeValuation(sales);
      if (pricing) total += pricing.buyItNowPrice;
    }
    return total;
  }

  async #loadItemIdsWithEvidence(
    database: ReturnType<typeof getDatabase>,
    itemIds: string[],
  ): Promise<Set<string>> {
    if (itemIds.length === 0) return new Set();
    const rows = await database
      .selectDistinct({ itemId: comparableSales.itemId })
      .from(comparableSales)
      .where(inArray(comparableSales.itemId, itemIds));
    return new Set(rows.map((row) => row.itemId));
  }

  /** Most recent inspect_images job's state/error per item. */
  async #loadJobInfo(
    database: ReturnType<typeof getDatabase>,
    itemIds: string[],
  ): Promise<Map<string, { state: JobStateValue; lastError?: string }>> {
    if (itemIds.length === 0) return new Map();

    const rows = await database
      .select({
        itemId: jobs.itemId,
        state: jobs.state,
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

    const jobInfoByItem = new Map<
      string,
      { state: JobStateValue; lastError?: string }
    >();
    for (const row of rows) {
      if (!jobInfoByItem.has(row.itemId)) {
        jobInfoByItem.set(row.itemId, {
          state: row.state,
          lastError: row.lastError ?? undefined,
        });
      }
    }
    return jobInfoByItem;
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
