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
}
