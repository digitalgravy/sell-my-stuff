import {
  identityPhotoConverter,
  type PhotoConverter,
} from '@/server/ai/photo-conversion';
import type {
  IdentificationCandidate,
  PhotoForIdentification,
  VisionIdentificationProvider,
} from '@/server/ai/vision-provider';
import type {
  IdentificationFactInput,
  ResearchJobRepository,
} from '@/server/items/research-repository';
import type { ObjectStore } from '@/server/storage/object-store';

import { RESEARCH_COMPARABLE_SALES_JOB_TYPE } from './research-comparable-sales-job';

export const INSPECT_IMAGES_JOB_TYPE = 'inspect_images';
export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_JOB_LEASE_MS = 15 * 60 * 1000;
export const BASE_RETRY_DELAY_MS = 5_000;
export const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const IDENTIFICATION_CONFIDENCE_THRESHOLD = 0.7;

export interface InspectImagesJobDependencies {
  jobs: ResearchJobRepository;
  objectStore: ObjectStore;
  vision: VisionIdentificationProvider;
  photoConverter?: PhotoConverter;
  maxAttempts?: number;
  leaseMs?: number;
  now?: () => Date;
}

export type InspectImagesJobResult =
  | { claimed: false }
  | { claimed: true; itemId: string; outcome: 'succeeded' | 'failed' };

export async function runInspectImagesJob(
  dependencies: InspectImagesJobDependencies,
): Promise<InspectImagesJobResult> {
  const maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const leaseMs = dependencies.leaseMs ?? DEFAULT_JOB_LEASE_MS;
  const photoConverter = dependencies.photoConverter ?? identityPhotoConverter;
  const job = await dependencies.jobs.claimNextJob(
    INSPECT_IMAGES_JOB_TYPE,
    maxAttempts,
    leaseMs,
  );
  if (!job) return { claimed: false };

  try {
    await dependencies.jobs.transitionItemStatus(job.itemId, 'IDENTIFYING');

    const photos = await dependencies.jobs.getItemPhotos(job.itemId);
    const photosForIdentification: PhotoForIdentification[] = await Promise.all(
      photos.map(async (photo) => {
        const original = Buffer.from(
          await dependencies.objectStore.get(photo.objectKey),
        );
        const converted = await photoConverter.convert({
          mediaType: photo.mediaType,
          buffer: original,
        });
        return {
          mediaType: converted.mediaType,
          base64: converted.buffer.toString('base64'),
        };
      }),
    );

    // Logged as pending right before the request goes to Anthropic (so the
    // Build log has something to show while it's in flight) and resolved
    // the moment a response or error comes back -- independently of
    // whatever happens afterwards (saving facts, transitioning status),
    // so a real, paid-for API call is never mis-recorded as failed just
    // because a later, unrelated step throws.
    const { runId } = await dependencies.jobs.startIdentificationRun({
      itemId: job.itemId,
      jobId: job.id,
      attempt: job.attempt,
      provider: dependencies.vision.provider,
      model: dependencies.vision.model,
      startedAt: dependencies.now?.() ?? new Date(),
    });

    const outcome = await identifyAndLog(dependencies, runId, photosForIdentification);
    const leading = [...outcome.result.candidates].sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    if (!leading) throw new Error('Vision provider returned no candidates');

    await dependencies.jobs.saveIdentificationFacts(
      job.itemId,
      buildIdentificationFacts(leading, outcome.result.openQuestions),
    );
    await dependencies.jobs.markPhotosInspected(
      photos.map((photo) => photo.id),
    );

    const needsInformation =
      leading.confidence < IDENTIFICATION_CONFIDENCE_THRESHOLD ||
      outcome.result.openQuestions.length > 0;
    await dependencies.jobs.transitionItemStatus(
      job.itemId,
      needsInformation ? 'NEEDS_INFORMATION' : 'RESEARCHING',
    );
    if (!needsInformation) {
      await dependencies.jobs.enqueueJob({
        itemId: job.itemId,
        type: RESEARCH_COMPARABLE_SALES_JOB_TYPE,
        idempotencyKey: `${RESEARCH_COMPARABLE_SALES_JOB_TYPE}:${job.itemId}:${job.attempt}`,
      });
    }

    await dependencies.jobs.completeJob(job.id, 100);
    return { claimed: true, itemId: job.itemId, outcome: 'succeeded' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const outcome = job.attempt >= maxAttempts ? 'FAILED' : 'RETRY';
    const now = dependencies.now?.() ?? new Date();
    const retryAt =
      outcome === 'RETRY'
        ? new Date(now.getTime() + retryDelayMs(job.attempt))
        : undefined;
    await dependencies.jobs.failJob(job.id, message, outcome, retryAt);
    if (outcome === 'FAILED') {
      await dependencies.jobs.transitionItemStatus(job.itemId, 'FAILED');
    }
    return { claimed: true, itemId: job.itemId, outcome: 'failed' };
  }
}

/**
 * Calls the vision model and resolves its pending identification_runs row
 * with the real outcome -- success with token usage, or failure with the
 * error -- then rethrows on failure so the caller's own job-retry handling
 * still applies. Isolated from downstream steps (saving facts, etc.) on
 * purpose: those can fail independently without this row's cost record
 * being overwritten or lost.
 */
async function identifyAndLog(
  dependencies: InspectImagesJobDependencies,
  runId: string,
  photos: PhotoForIdentification[],
) {
  try {
    const outcome = await dependencies.vision.identify(photos);
    await dependencies.jobs.completeIdentificationRun({
      runId,
      outcome: 'succeeded',
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      response: outcome.result,
      completedAt: dependencies.now?.() ?? new Date(),
    });
    return outcome;
  } catch (error) {
    await dependencies.jobs.completeIdentificationRun({
      runId,
      outcome: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      completedAt: dependencies.now?.() ?? new Date(),
    });
    throw error;
  }
}

export function retryDelayMs(attempt: number): number {
  return Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
}

function buildIdentificationFacts(
  candidate: IdentificationCandidate,
  openQuestions: string[],
): IdentificationFactInput[] {
  const facts: IdentificationFactInput[] = [
    {
      field: 'identity.item_type',
      value: JSON.stringify(candidate.itemType),
      confidence: candidate.confidence,
      origin: 'image_inference',
      evidence: candidate.evidence,
    },
  ];

  const optionalFields: [string, string | string[] | undefined][] = [
    ['identity.manufacturer', candidate.manufacturer],
    ['identity.family', candidate.family],
    ['identity.model', candidate.model],
    ['identity.model_numbers', candidate.modelNumbers],
    ['identity.colour', candidate.colour],
  ];
  for (const [field, value] of optionalFields) {
    if (value === undefined || (Array.isArray(value) && value.length === 0))
      continue;
    facts.push({
      field,
      value: JSON.stringify(value),
      confidence: candidate.confidence,
      origin: 'image_inference',
      evidence: candidate.evidence,
    });
  }

  if (openQuestions.length > 0) {
    facts.push({
      field: 'identity.open_questions',
      value: JSON.stringify(openQuestions),
      confidence: 1,
      origin: 'image_inference',
    });
  }

  return facts;
}
