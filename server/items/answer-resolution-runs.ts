import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { answerResolutionRuns } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import { ITEM_EVENT_KIND, logItemEvent } from './item-events';

export interface AnswerResolutionRunStartInput {
  itemId: string;
  provider: string;
  model: string;
  answerCount: number;
}

export interface AnswerResolutionRunCompleteInput {
  runId: string;
  outcome: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
}

/**
 * Logged before the request goes to Anthropic, so the Build log can show a
 * pending entry -- see identificationRuns for the same pattern. Returns
 * the logged event's own id too, since the actual pre/post change list
 * isn't known until the call resolves and the facts are saved -- see
 * setItemEventDetail, called once that happens.
 */
export async function startAnswerResolutionRun(
  input: AnswerResolutionRunStartInput,
): Promise<{ runId: string; eventId: string }> {
  const database = getDatabase();
  const id = randomUUID();
  await database.insert(answerResolutionRuns).values({
    id,
    itemId: input.itemId,
    provider: input.provider,
    model: input.model,
    answerCount: input.answerCount,
    startedAt: new Date(),
  });
  const { id: eventId } = await logItemEvent({
    itemId: input.itemId,
    kind: ITEM_EVENT_KIND.ANSWERS_RESOLVED,
    sourceTable: 'answer_resolution_runs',
    sourceId: id,
    summary: `Resolved ${input.answerCount} answer${input.answerCount === 1 ? '' : 's'}`,
  });
  return { runId: id, eventId };
}

export async function completeAnswerResolutionRun(
  input: AnswerResolutionRunCompleteInput,
): Promise<void> {
  const database = getDatabase();
  await database
    .update(answerResolutionRuns)
    .set({
      outcome: input.outcome,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      response: input.response,
      errorMessage: input.errorMessage,
      completedAt: new Date(),
    })
    .where(eq(answerResolutionRuns.id, input.runId));
}
