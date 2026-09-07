import { usdToGbp } from '@/server/ai/pricing';

import { estimateMarketplaceFeeGbp } from './fees';
import type { ItemDetail, ItemDetailFact, PhaseInfo } from './item-detail-repository';
import type { ItemStatusValue } from './research-repository';

export type ItemListPill = 'needs_action' | 'ready' | 'at_auction' | 'complete' | 'in_progress';

export interface ItemListEntry {
  id: string;
  title: string;
  status: ItemStatusValue;
  updatedAt: string;
  heroPhotoUrl?: string;
  pill: ItemListPill;
  pillLabel: string;
  /**
   * A short in-progress stage label ("Identifying", "Queued for
   * identification") -- deliberately NOT the attention task's own title
   * for "needs_action" (that can be a full question/sentence, which
   * doesn't scan well wrapped under a pill in a fixed-width table column;
   * the item's own page has the room to explain why). Undefined whenever
   * there's nothing short and useful to add.
   */
  detail?: string;
  /** The recommended Buy-It-Now price minus AI research cost so far and an approximate marketplace fee -- see server/items/fees.ts. */
  estimatedProfit?: number;
  /** Identified/Assessed/Researched/Draft ready -- same PhaseInfo the item detail page's header strip renders, for a compact per-row progress indicator. */
  phases: PhaseInfo[];
}

const PILL_LABEL: Record<ItemListPill, string> = {
  needs_action: 'Needs input',
  ready: 'Ready',
  at_auction: 'At auction',
  complete: 'Sold',
  in_progress: 'In progress',
};

// Mirrors homepage-snapshot.ts's WORKING_STAGE_LABEL for the one other
// status (RESEARCHING) that already has evidence handled separately below.
const IN_PROGRESS_STAGE_LABEL: Partial<Record<ItemStatusValue, string>> = {
  INBOX: 'Queued for identification',
  IDENTIFYING: 'Identifying',
};

function factString(facts: ItemDetailFact[], field: string): string | undefined {
  const value = facts.find((fact) => fact.field === field)?.value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Same precedence as homepage-snapshot.ts's displayTitle, adapted for ItemDetail's raw fact array shape. */
export function deriveItemTitle(facts: ItemDetailFact[]): string {
  const manufacturer = factString(facts, 'identity.manufacturer');
  const model = factString(facts, 'identity.model');
  const itemType = factString(facts, 'identity.item_type');
  if (manufacturer && model) return `${manufacturer} ${model}`;
  if (manufacturer && itemType) return `${manufacturer} ${itemType}`;
  return model ?? itemType ?? 'Unidentified item';
}

export function buildItemListEntry(detail: ItemDetail): ItemListEntry {
  const title = deriveItemTitle(detail.facts);
  const requiredTasks = detail.attention.filter((task) => task.required);

  let pill: ItemListPill;
  let itemDetail: string | undefined;

  if (detail.status === 'LIVE') {
    pill = 'at_auction';
    // No auction/listing data model exists yet, so there is no real end
    // time to show -- never fabricate one.
    itemDetail = undefined;
  } else if (detail.status === 'SOLD' || detail.status === 'COMPLETE') {
    pill = 'complete';
  } else if (requiredTasks.length > 0) {
    pill = 'needs_action';
  } else if (detail.pricing) {
    pill = 'ready';
  } else {
    pill = 'in_progress';
    itemDetail = IN_PROGRESS_STAGE_LABEL[detail.status] ?? detail.status;
  }

  return {
    id: detail.id,
    title,
    status: detail.status,
    updatedAt: detail.updatedAt,
    heroPhotoUrl: detail.photos[0]?.url,
    pill,
    pillLabel: PILL_LABEL[pill],
    detail: itemDetail,
    estimatedProfit:
      detail.pricing === undefined
        ? undefined
        : detail.pricing.buyItNowPrice -
          usdToGbp(detail.aiCostUsd) -
          estimateMarketplaceFeeGbp(detail.pricing.buyItNowPrice),
    phases: detail.phases,
  };
}
