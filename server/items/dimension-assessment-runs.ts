import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { dimensionAssessmentRuns } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import { ITEM_EVENT_KIND, logItemEvent } from './item-events';

export interface DimensionAssessmentRunStartInput {
  itemId: string;
  jobId: string;
  attempt: number;
  provider: string;
  model: string;
  startedAt: Date;
}

export interface DimensionAssessmentRunCompleteInput {
  runId: string;
  outcome: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
  completedAt: Date;
}

/** Logged before the request goes to Anthropic, so the Build log can show a pending entry -- see condition-assessment-runs.ts for the same pattern. */
export async function startDimensionAssessmentRun(
  input: DimensionAssessmentRunStartInput,
): Promise<{ runId: string }> {
  const database = getDatabase();
  const id = randomUUID();
  await database.insert(dimensionAssessmentRuns).values({
    id,
    itemId: input.itemId,
    jobId: input.jobId,
    attempt: input.attempt,
    provider: input.provider,
    model: input.model,
    startedAt: input.startedAt,
  });
  await logItemEvent({
    itemId: input.itemId,
    kind: ITEM_EVENT_KIND.DIMENSIONS_RUN,
    sourceTable: 'dimension_assessment_runs',
    sourceId: id,
    summary: 'Packaging dimensions assessment',
  });
  return { runId: id };
}

export async function completeDimensionAssessmentRun(
  input: DimensionAssessmentRunCompleteInput,
): Promise<void> {
  const database = getDatabase();
  await database
    .update(dimensionAssessmentRuns)
    .set({
      outcome: input.outcome,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      response: input.response,
      errorMessage: input.errorMessage,
      completedAt: input.completedAt,
    })
    .where(eq(dimensionAssessmentRuns.id, input.runId));
}
