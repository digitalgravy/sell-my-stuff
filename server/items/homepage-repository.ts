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
}

export interface HomepageRepository {
  /** Items still in an active (non-terminal) status, most recently updated first. */
  listActiveItems(): Promise<HomepageItemRow[]>;
}
