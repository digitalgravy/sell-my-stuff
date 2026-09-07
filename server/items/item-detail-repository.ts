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
  /** 'pending' is a real, in-flight AI call -- the request has been sent to Anthropic and no response has come back yet. */
  outcome: 'succeeded' | 'failed' | 'pending';
  durationMs: number;
  blocks: BuildStepBlock[];
  artifacts?: string[];
  /**
   * Present only on steps that can be reversed (a comparable-sales import,
   * a fact correction) -- lets the UI offer an Undo control. `endpoint` is
   * a path relative to `/api/items/{id}/` that a DELETE reverts.
   */
  undo?: { endpoint: string };
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
  /** Present only on tasks whose CTA is "open this link" rather than an in-app action. */
  href?: string;
  title: string;
  note: string;
  impact: string;
  ctaLabel: string;
  required: boolean;
}

export interface PricingAdvice {
  /** The trimmed-outlier IQR of comparable sale prices actually used. */
  likelyAchievedLow: number;
  likelyAchievedHigh: number;
  buyItNowPrice: number;
  acceptOffersLow: number;
  acceptOffersHigh: number;
  quickSalePrice: number;
  autoDeclineBelow: number;
  confidence: 'high' | 'medium' | 'low';
  /** How many comparable sales were actually used after excluding and trimming outliers. */
  evidenceCount: number;
  /** Present only when there were enough recent sales (see RECENT_WINDOW_DAYS) to use just those, rather than the full evidence set. */
  evidenceWindowDays?: number;
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
  /** Absent for a raw scraped sale that hasn't been persisted yet (server/research/sold-listings-html.ts's output, before import). */
  id?: string;
  title: string;
  match: string;
  soldAt: string;
  price: number;
  excluded?: boolean;
  /** Set by the import-time match classifier when it excludes this listing; absent for a manual toggle or an included sale. */
  excludedReason?: string;
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
  /** Real Anthropic API spend so far (identification + match classification calls), in USD -- 0, not undefined, when nothing has run yet. */
  aiCostUsd: number;
  buildSteps: BuildStep[];
}

export type RetryOutcome = { ok: true } | { ok: false; reason: string };
export type CorrectFactOutcome = { ok: true } | { ok: false; reason: string };
export type UndoCorrectionOutcome = { ok: true } | { ok: false; reason: string };
export type RegenerateResearchOutcome = { ok: true } | { ok: false; reason: string };

export interface ItemDetailRepository {
  getItemDetail(itemId: string): Promise<ItemDetail | null>;
  getPhotoForItem(
    itemId: string,
    photoId: string,
  ): Promise<{ objectKey: string; mediaType: string } | null>;
  /**
   * Manual re-run of identification, always available regardless of any
   * auto-retry policy or current status (except IDENTIFYING, where an
   * attempt is already in flight) -- creates a fresh job/attempt rather
   * than mutating an existing one, so every prior attempt stays visible
   * in the Build log rather than being overwritten.
   */
  requestReidentification(itemId: string): Promise<RetryOutcome>;
  /** Records a user-supplied correction as a `user_confirmed` fact, and logs it (with the prior value) so it can be undone. */
  correctFact(
    itemId: string,
    field: string,
    value: string,
  ): Promise<CorrectFactOutcome>;
  /** Reverts one correction to exactly its prior value (or removes the fact if there was none before it). */
  undoCorrection(itemId: string, correctionId: string): Promise<UndoCorrectionOutcome>;
  /** Manually re-queues research_comparable_sales -- e.g. after correcting a fact the eBay search was built from. */
  regenerateResearch(itemId: string): Promise<RegenerateResearchOutcome>;
  /**
   * Marks a comparable sale included or excluded from pricing -- a manual
   * toggle always overrides whatever the import-time match classifier (or
   * an earlier toggle) decided, and clears any classifier-supplied reason
   * since the human judgment is now the reason.
   */
  setSaleExcluded(
    itemId: string,
    saleId: string,
    excluded: boolean,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * Re-runs the match classifier against every comparable sale already on
   * the item -- for evidence imported before the classifier existed, or to
   * retry after correcting a fact the earlier classification used. This
   * overwrites every row's excluded/excludedReason with a fresh verdict,
   * including any manual toggle -- a re-check starts clean rather than
   * trying to guess which prior excludes were manual.
   */
  reclassifyEvidence(itemId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Permanently deletes the item and everything under it (photos, facts, jobs, build log — cascade). */
  deleteItem(itemId: string): Promise<{ ok: boolean }>;
}
