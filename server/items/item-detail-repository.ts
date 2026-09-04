import type { ActivityState } from './homepage-snapshot';
import type { ItemStatusValue } from './research-repository';

export interface ItemDetailPhoto {
  id: string;
  originalName: string;
  mediaType: string;
  position: number;
  status: 'UPLOADED' | 'INSPECTING' | 'READY' | 'REJECTED';
}

export interface ItemDetailFact {
  field: string;
  value: unknown;
  confidence: number;
  origin: string;
  evidence?: string;
  source?: string;
  retrievedAt: string;
  userConfirmed: boolean;
}

export interface ItemDetailRun {
  id: string;
  attempt: number;
  provider: string;
  model: string;
  outcome: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
  startedAt: string;
  completedAt: string;
}

export interface ItemDetail {
  id: string;
  status: ItemStatusValue;
  /** Absent for NEEDS_INFORMATION — correctly blocked on the user, not "paused" (same rule as the homepage). */
  activity?: ActivityState;
  createdAt: string;
  updatedAt: string;
  photos: ItemDetailPhoto[];
  facts: ItemDetailFact[];
  runs: ItemDetailRun[];
}

export type RetryOutcome = { ok: true } | { ok: false; reason: string };

export interface ItemDetailRepository {
  getItemDetail(itemId: string): Promise<ItemDetail | null>;
  getPhotoForItem(
    itemId: string,
    photoId: string,
  ): Promise<{ objectKey: string; mediaType: string } | null>;
  /** Manual override, always available regardless of any auto-retry policy — requires the item to currently be FAILED. */
  retryFailedItem(itemId: string): Promise<RetryOutcome>;
}
