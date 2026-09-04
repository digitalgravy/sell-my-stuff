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
  | 'COMPLETE';

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
  markPhotosInspected(photoIds: string[]): Promise<void>;
  transitionItemStatus(itemId: string, status: ItemStatusValue): Promise<void>;
  completeJob(jobId: string, progress: number): Promise<void>;
  failJob(
    jobId: string,
    error: string,
    outcome: 'RETRY' | 'FAILED',
    retryAt?: Date,
  ): Promise<void>;
}
