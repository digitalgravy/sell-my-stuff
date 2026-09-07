import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { conditionAssessmentRuns } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import { ITEM_EVENT_KIND, logItemEvent } from './item-events';

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
  outcome: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
  completedAt: Date;
}

/** Logged before the request goes to Anthropic, so the Build log can show a pending entry -- see identificationRuns for the same pattern. */
export async function startConditionAssessmentRun(
  input: ConditionAssessmentRunStartInput,
): Promise<{ runId: string }> {
  const database = getDatabase();
  const id = randomUUID();
  await database.insert(conditionAssessmentRuns).values({
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
    kind: ITEM_EVENT_KIND.CONDITION_RUN,
    sourceTable: 'condition_assessment_runs',
    sourceId: id,
    summary: 'Condition assessment',
  });
  return { runId: id };
}

export async function completeConditionAssessmentRun(
  input: ConditionAssessmentRunCompleteInput,
): Promise<void> {
  const database = getDatabase();
  await database
    .update(conditionAssessmentRuns)
    .set({
      outcome: input.outcome,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      response: input.response,
      errorMessage: input.errorMessage,
      completedAt: input.completedAt,
    })
    .where(eq(conditionAssessmentRuns.id, input.runId));
}
