export interface ClaimedJob {
  id: string;
  itemId: string;
  type: string;
  attempt: number;
}

export interface ItemPhotoForResearch {
  id: string;
  objectKey: string;
  mediaType: string;
}

export type FactOrigin =
  | 'user_evidence'
  | 'image_inference'
  | 'web_research'
  | 'manufacturer_data'
  | 'user_confirmed';

export interface IdentificationFactInput {
  field: string;
  value: string;
  confidence: number;
  origin: FactOrigin;
  evidence?: string;
  source?: string;
}

export type IdentificationRunOutcome = 'succeeded' | 'failed';

export interface IdentificationRunStartInput {
  itemId: string;
  jobId: string;
  attempt: number;
  provider: string;
  model: string;
  startedAt: Date;
}

export interface IdentificationRunCompleteInput {
  runId: string;
  outcome: IdentificationRunOutcome;
  inputTokens?: number;
  outputTokens?: number;
  /** The full raw identification result (every candidate, not just the leading one) — present only on success. */
  response?: unknown;
  errorMessage?: string;
  completedAt: Date;
}

export type ConditionAssessmentRunOutcome = 'succeeded' | 'failed';

export interface ConditionAssessmentRunStartInput {
  itemId: string;
  jobId: string;
  attempt: number;
  provider: string;
  model: string;
  startedAt: Date;
}

export interface ConditionAssessmentRunCompleteInput {
  runId: string;
  outcome: ConditionAssessmentRunOutcome;
  inputTokens?: number;
  outputTokens?: number;
  /** The full raw condition-assessment result -- present only on success. */
  response?: unknown;
  errorMessage?: string;
  completedAt: Date;
}

export type MatchClassificationRunOutcome = 'succeeded' | 'failed';

export interface MatchClassificationRunStartInput {
  itemId: string;
  provider: string;
  model: string;
  listingCount: number;
}

export interface MatchClassificationRunCompleteInput {
  runId: string;
  outcome: MatchClassificationRunOutcome;
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
}

/**
 * A Build log entry a job wants to record explicitly -- for actions with no
 * existing dedicated run table to hang off (an imported search link, a
 * failed research attempt). `kind` is a plain string, matching item_events
 * itself (see db/schema.ts) rather than importing the full ItemEventKind
 * union here, so this file stays free of any DB/server-module dependency.
 */
export interface JobEventInput {
  itemId: string;
  kind: string;
  summary: string;
  detail?: unknown;
}

export interface ComparableSaleInput {
  title: string;
  match: string;
  soldAt: string;
  price: number;
  excluded?: boolean;
  excludedReason?: string;
}

export type ItemStatusValue =
  | 'INBOX'
  | 'IDENTIFYING'
  | 'NEEDS_INFORMATION'
  | 'RESEARCHING'
  | 'VALUING'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'LIVE'
  | 'SOLD'
  | 'AWAITING_DISPATCH'
  | 'DISPATCHED'
  | 'COMPLETE'
  | 'FAILED';

export interface ResearchJobRepository {
  /** Atomically claims the oldest eligible job of `type`, or returns null if none is available. */
  claimNextJob(
    type: string,
    maxAttempts: number,
    leaseMs: number,
  ): Promise<ClaimedJob | null>;
  getItemPhotos(itemId: string): Promise<ItemPhotoForResearch[]>;
  saveIdentificationFacts(
    itemId: string,
    facts: IdentificationFactInput[],
  ): Promise<void>;
  /** Logged before the request goes to Anthropic, so the Build log can show a pending entry. */
  startIdentificationRun(entry: IdentificationRunStartInput): Promise<{ runId: string }>;
  completeIdentificationRun(entry: IdentificationRunCompleteInput): Promise<void>;
  /** Logged before the request goes to Anthropic, so the Build log can show a pending entry -- see startIdentificationRun. */
  startConditionAssessmentRun(
    entry: ConditionAssessmentRunStartInput,
  ): Promise<{ runId: string }>;
  completeConditionAssessmentRun(entry: ConditionAssessmentRunCompleteInput): Promise<void>;
  markPhotosInspected(photoIds: string[]): Promise<void>;
  transitionItemStatus(itemId: string, status: ItemStatusValue): Promise<void>;
  completeJob(jobId: string, progress: number): Promise<void>;
  failJob(
    jobId: string,
    error: string,
    outcome: 'RETRY' | 'FAILED',
    retryAt?: Date,
  ): Promise<void>;
  getIdentityFacts(itemId: string): Promise<{ field: string; value: string }[]>;
  /** No-ops (rather than erroring) if idempotencyKey already exists -- callers may safely re-enqueue on retry. */
  enqueueJob(input: { itemId: string; type: string; idempotencyKey: string }): Promise<void>;
  /** Imports comparable sales found by automated browser research -- same shape as a capture import, but with no source capture row to attribute them to. */
  saveComparableSales(itemId: string, sales: ComparableSaleInput[]): Promise<void>;
  /** Logged before the request goes to the match classifier, so the Build log can show a pending entry -- see startIdentificationRun. */
  startMatchClassificationRun(
    entry: MatchClassificationRunStartInput,
  ): Promise<{ runId: string }>;
  completeMatchClassificationRun(entry: MatchClassificationRunCompleteInput): Promise<void>;
  /** Records a Build log entry for an action with no dedicated run table of its own -- see JobEventInput. */
  logItemEvent(entry: JobEventInput): Promise<void>;
}
