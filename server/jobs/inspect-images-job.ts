import type {
  ConditionAssessmentProvider,
  ConditionAssessmentResult,
  ConditionField,
} from '@/server/ai/condition-provider';
import type {
  DimensionField,
  DimensionsAssessmentProvider,
  DimensionsAssessmentResult,
} from '@/server/ai/dimensions-provider';
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
// Exported for postgres-item-detail-repository.ts's resolveFactAnswers,
// which needs to re-run this exact same readiness check after a batch of
// answers is saved, to decide whether the item can now leave
// NEEDS_INFORMATION on its own rather than waiting for another full
// identification attempt.
export const IDENTIFICATION_CONFIDENCE_THRESHOLD = 0.7;

export interface InspectImagesJobDependencies {
  jobs: ResearchJobRepository;
  objectStore: ObjectStore;
  vision: VisionIdentificationProvider;
  /** Undefined skips condition assessment entirely -- identification alone is still a complete, useful run. */
  condition?: ConditionAssessmentProvider;
  /** Undefined skips the dimensions/packaging assessment entirely -- see condition's own doc comment above. */
  dimensions?: DimensionsAssessmentProvider;
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

    // A confident-but-generic identification (e.g. "definitely a wireless
    // keyboard", no manufacturer or model) still can't drive a useful eBay
    // search on its own -- folded into the same openQuestions array rather
    // than a separate mechanism, so it surfaces exactly like any other
    // open question and gates research the same way.
    const openQuestions = outcome.result.canSearchEbayConfidently
      ? outcome.result.openQuestions
      : [
          ...outcome.result.openQuestions,
          outcome.result.searchReadinessNote ??
            'Not enough specific detail yet to search eBay for genuine comparable sales -- a clearer manufacturer/model would help.',
        ];
    const identityFacts = buildIdentificationFacts(leading, openQuestions);

    // A second, separate vision-model turn -- condition is its own concern
    // from identity (see condition-provider.ts), logged to its own Build
    // log row. Skipped entirely (not a failure) when no provider is
    // configured; a real call that errors fails the whole job, the same as
    // identification, rather than silently losing a paid-for attempt.
    //
    // Deliberately does NOT feed into needsInformation below: eBay research
    // only needs identity facts (see buildSearchKeywords), so an uncertain
    // condition grade shouldn't hold up a step it has no bearing on. Low-
    // confidence condition fields and open questions still get saved and
    // still surface as (non-blocking) attention tasks -- see deriveAttention
    // -- for the user to firm up whenever they get to it, in parallel with
    // research running rather than gating it.
    let conditionFacts: IdentificationFactInput[] = [];
    if (dependencies.condition) {
      const conditionProvider = dependencies.condition;
      const { runId: conditionRunId } = await dependencies.jobs.startConditionAssessmentRun({
        itemId: job.itemId,
        jobId: job.id,
        attempt: job.attempt,
        provider: conditionProvider.provider,
        model: conditionProvider.model,
        startedAt: dependencies.now?.() ?? new Date(),
      });
      const conditionOutcome = await assessConditionAndLog(
        dependencies,
        conditionRunId,
        photosForIdentification,
      );
      conditionFacts = buildConditionFacts(conditionOutcome.result);
    }

    // A third, separate vision-model turn -- packaging is its own concern
    // from identity and condition (see dimensions-provider.ts). Given the
    // leading identification candidate as context so the model can use real
    // product knowledge once identity is confident, rather than estimating
    // from pixels alone. Same non-blocking treatment as condition above --
    // never gates eBay research.
    let dimensionsFacts: IdentificationFactInput[] = [];
    if (dependencies.dimensions) {
      const dimensionsProvider = dependencies.dimensions;
      const { runId: dimensionsRunId } = await dependencies.jobs.startDimensionAssessmentRun({
        itemId: job.itemId,
        jobId: job.id,
        attempt: job.attempt,
        provider: dimensionsProvider.provider,
        model: dimensionsProvider.model,
        startedAt: dependencies.now?.() ?? new Date(),
      });
      const dimensionsOutcome = await assessDimensionsAndLog(
        dependencies,
        dimensionsRunId,
        photosForIdentification,
        {
          manufacturer: leading.manufacturer,
          family: leading.family,
          model: leading.model,
          itemType: leading.itemType,
        },
      );
      dimensionsFacts = buildDimensionsFacts(dimensionsOutcome.result);
    }

    await dependencies.jobs.saveIdentificationFacts(job.itemId, [
      ...identityFacts,
      ...conditionFacts,
      ...dimensionsFacts,
    ]);
    await dependencies.jobs.markPhotosInspected(
      photos.map((photo) => photo.id),
    );

    const needsInformation =
      leading.confidence < IDENTIFICATION_CONFIDENCE_THRESHOLD ||
      openQuestions.length > 0;
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

/**
 * Calls the condition provider and resolves its pending
 * condition_assessment_runs row -- same shape and isolation as
 * identifyAndLog.
 */
async function assessConditionAndLog(
  dependencies: InspectImagesJobDependencies,
  runId: string,
  photos: PhotoForIdentification[],
) {
  try {
    // Guarded by the `if (dependencies.condition)` check at the one call
    // site, but that narrowing doesn't survive being passed into this
    // separate function -- assert non-null rather than re-checking.
    const outcome = await dependencies.condition!.assess(photos);
    await dependencies.jobs.completeConditionAssessmentRun({
      runId,
      outcome: 'succeeded',
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      response: outcome.result,
      completedAt: dependencies.now?.() ?? new Date(),
    });
    return outcome;
  } catch (error) {
    await dependencies.jobs.completeConditionAssessmentRun({
      runId,
      outcome: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      completedAt: dependencies.now?.() ?? new Date(),
    });
    throw error;
  }
}

function buildConditionFacts(result: ConditionAssessmentResult): IdentificationFactInput[] {
  const facts: IdentificationFactInput[] = [
    {
      field: 'condition.overall_grade',
      value: JSON.stringify(result.overallGrade.grade),
      confidence: result.overallGrade.confidence,
      origin: 'image_inference',
      evidence: result.overallGrade.evidence,
    },
  ];

  const optionalFields: [string, ConditionField | undefined][] = [
    ['condition.functional_status', result.functionalStatus],
    ['condition.cosmetic_wear', result.cosmeticWear],
    ['condition.defects', result.defects],
    ['condition.missing_parts', result.missingParts],
  ];
  for (const [field, value] of optionalFields) {
    if (value === undefined) continue;
    facts.push({
      field,
      value: JSON.stringify(value.value),
      confidence: value.confidence,
      origin: 'image_inference',
      evidence: value.evidence,
    });
  }

  if (result.openQuestions.length > 0) {
    facts.push({
      field: 'condition.open_questions',
      value: JSON.stringify(result.openQuestions),
      confidence: 1,
      origin: 'image_inference',
    });
  }

  return facts;
}

/**
 * Calls the dimensions provider and resolves its pending
 * dimension_assessment_runs row -- same shape and isolation as
 * assessConditionAndLog.
 */
async function assessDimensionsAndLog(
  dependencies: InspectImagesJobDependencies,
  runId: string,
  photos: PhotoForIdentification[],
  identity: { manufacturer?: string; family?: string; model?: string; itemType?: string },
) {
  try {
    // Guarded by the `if (dependencies.dimensions)` check at the one call
    // site, but that narrowing doesn't survive being passed into this
    // separate function -- assert non-null rather than re-checking.
    const outcome = await dependencies.dimensions!.assess(photos, identity);
    await dependencies.jobs.completeDimensionAssessmentRun({
      runId,
      outcome: 'succeeded',
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      response: outcome.result,
      completedAt: dependencies.now?.() ?? new Date(),
    });
    return outcome;
  } catch (error) {
    await dependencies.jobs.completeDimensionAssessmentRun({
      runId,
      outcome: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      completedAt: dependencies.now?.() ?? new Date(),
    });
    throw error;
  }
}

function buildDimensionsFacts(result: DimensionsAssessmentResult): IdentificationFactInput[] {
  const facts: IdentificationFactInput[] = [];

  const optionalDimensionFields: [string, DimensionField | undefined][] = [
    ['packaging.length_cm', result.lengthCm],
    ['packaging.width_cm', result.widthCm],
    ['packaging.height_cm', result.heightCm],
    ['packaging.weight_kg', result.weightKg],
  ];
  for (const [field, value] of optionalDimensionFields) {
    if (value === undefined) continue;
    facts.push({
      field,
      value: JSON.stringify(value.value),
      confidence: value.confidence,
      origin: 'image_inference',
      evidence: value.evidence,
    });
  }

  facts.push({
    field: 'packaging.fragility',
    value: JSON.stringify(result.fragility.grade),
    confidence: result.fragility.confidence,
    origin: 'image_inference',
    evidence: result.fragility.evidence,
  });

  if (result.specialHandling && result.specialHandling.flags.length > 0) {
    facts.push({
      field: 'packaging.special_handling',
      value: JSON.stringify(result.specialHandling.flags),
      confidence: result.specialHandling.confidence,
      origin: 'image_inference',
      evidence: result.specialHandling.evidence,
    });
  }

  if (result.openQuestions.length > 0) {
    facts.push({
      field: 'packaging.open_questions',
      value: JSON.stringify(result.openQuestions),
      confidence: 1,
      origin: 'image_inference',
    });
  }

  return facts;
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

  // Always present (the schema requires at least one) -- see
  // research-comparable-sales-job.ts's getSearchTermCandidates, which
  // tries these in order instead of building one query by concatenating
  // manufacturer/family/model in code.
  facts.push({
    field: 'identity.ebay_search_terms',
    value: JSON.stringify(candidate.ebaySearchTerms),
    confidence: 1,
    origin: 'image_inference',
  });

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
