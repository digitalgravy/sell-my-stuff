import type { ItemStatusValue } from './research-repository';

export type JobStateValue =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface HomepageItemFacts {
  itemType?: string;
  manufacturer?: string;
  model?: string;
  openQuestions: string[];
  /** Set once research_comparable_sales completes -- a direct, pre-filtered eBay Sold+Completed search link. */
  ebaySearchUrl?: string;
}

export interface HomepageItemRow {
  id: string;
  status: ItemStatusValue;
  updatedAt: Date;
  facts: HomepageItemFacts;
  /** The most recent inspect_images job's current state, if one exists. */
  jobState?: JobStateValue;
  /** The most recent inspect_images job's error, present only when status is FAILED. */
  lastError?: string;
  /** Whether at least one comparable sale has been imported onto this item. */
  hasEvidence: boolean;
}

export interface HomepageOutcomeCounts {
  live: number;
  cleared: number;
  /** Sum of a real recorded sale price -- always 0 today: no sale-price field exists anywhere yet. */
  realisedTotal: number;
  /** Sum of computeValuation's buyItNowPrice across every active (non-terminal) item that has one. */
  estimatedValueTotal: number;
}

export interface HomepageRepository {
  /** Items still in an active (non-terminal) status, most recently updated first. */
  listActiveItems(): Promise<HomepageItemRow[]>;
  /** Counts and totals outside the active set, plus the active set's estimated value. */
  getOutcomeCounts(): Promise<HomepageOutcomeCounts>;
}
