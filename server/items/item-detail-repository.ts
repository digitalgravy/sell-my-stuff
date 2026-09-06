import type { ActivityState } from './homepage-snapshot';
import type { ItemStatusValue } from './research-repository';

export interface ItemDetailPhoto {
  id: string;
  url: string;
  label: string;
  position: number;
}

export interface ItemDetailFact {
  field: string;
  value: unknown;
  confidence: number;
  origin: string;
  evidence?: string;
  retrievedAt: string;
}

export interface BuildStepBlock {
  label: string;
  meta?: string;
  content: string;
}

export type BuildStepType = 'llm' | 'tool' | 'compute' | 'policy';

export interface BuildStep {
  id: string;
  stage: string;
  detail: string;
  type: BuildStepType;
  outcome: 'succeeded' | 'failed';
  durationMs: number;
  blocks: BuildStepBlock[];
  artifacts?: string[];
  /** Present only on steps that can be reversed (e.g. a comparable-sales import) -- lets the UI offer an Undo control. */
  undo?: { captureId: string };
}

export type PhaseState = 'done' | 'pending' | 'not_started';

export interface PhaseInfo {
  key: string;
  label: string;
  detail: string;
  state: PhaseState;
}

export interface AttentionTask {
  id: string;
  field?: string;
  title: string;
  note: string;
  impact: string;
  ctaLabel: string;
  required: boolean;
}

export interface PricingAdvice {
  buyItNowPrice: number;
  basis: string;
  acceptOffersRange: string;
  autoDeclineBelow: number;
}

export interface ListingStrategyOption {
  name: string;
  recommended: boolean;
  value: string;
  detail: string;
}

export interface ListingCheck {
  label: string;
  state: 'yes' | 'required' | 'optional';
}

export interface ListingInfo {
  title: string;
  description: string;
  marketplace: string;
  strategyOptions: ListingStrategyOption[];
  checks: ListingCheck[];
}

export interface ComparableSale {
  title: string;
  match: string;
  soldAt: string;
  price: number;
  excluded?: boolean;
}

export interface EvidenceInfo {
  sales: ComparableSale[];
  fairValue: number;
  note: string;
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
  phases: PhaseInfo[];
  attention: AttentionTask[];
  /** Undefined until real research/pricing exists — render an honest "not built yet" state, never a fabricated number. */
  pricing?: PricingAdvice;
  /** Undefined until a real listing-drafting stage exists. */
  listing?: ListingInfo;
  /** Undefined until real comparable-sales research exists. */
  evidence?: EvidenceInfo;
  buildSteps: BuildStep[];
}

export type RetryOutcome = { ok: true } | { ok: false; reason: string };
export type CorrectFactOutcome = { ok: true } | { ok: false; reason: string };

export interface ItemDetailRepository {
  getItemDetail(itemId: string): Promise<ItemDetail | null>;
  getPhotoForItem(
    itemId: string,
    photoId: string,
  ): Promise<{ objectKey: string; mediaType: string } | null>;
  /** Manual override, always available regardless of any auto-retry policy — requires the item to currently be FAILED. */
  retryFailedItem(itemId: string): Promise<RetryOutcome>;
  /** Records a user-supplied correction as a `user_confirmed` fact — becomes the authoritative value. */
  correctFact(
    itemId: string,
    field: string,
    value: string,
  ): Promise<CorrectFactOutcome>;
  /** Permanently deletes the item and everything under it (photos, facts, jobs, build log — cascade). */
  deleteItem(itemId: string): Promise<{ ok: boolean }>;
}
