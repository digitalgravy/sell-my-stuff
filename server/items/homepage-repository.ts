import type { ItemStatusValue } from './research-repository';

export interface HomepageItemFacts {
  itemType?: string;
  manufacturer?: string;
  model?: string;
  openQuestions: string[];
}

export interface HomepageItemRow {
  id: string;
  status: ItemStatusValue;
  updatedAt: Date;
  facts: HomepageItemFacts;
  /** The most recent inspect_images job's error, present only when status is FAILED. */
  lastError?: string;
}

export interface HomepageRepository {
  /** Items still in an active (non-terminal) status, most recently updated first. */
  listActiveItems(): Promise<HomepageItemRow[]>;
}
