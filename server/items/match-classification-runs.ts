import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { matchClassificationRuns } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import { ITEM_EVENT_KIND, logItemEvent } from './item-events';

export interface MatchClassificationRunStartInput {
  itemId: string;
  provider: string;
  model: string;
  listingCount: number;
}

export interface MatchClassificationRunCompleteInput {
  runId: string;
  outcome: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
}

/**
 * Logged before the request goes to Anthropic, so the Build log can show a
 * pending entry -- see identificationRuns for the same pattern. The one
 * choke point for every match-classification call (auto-import,
 * `research-comparable-sales-job.ts`; manual capture import,
 * `postgres-capture-inbox-repository.ts`; a manual re-check,
 * `reclassifyEvidence`) -- logging the item_events row here covers all
 * three without each call site needing to know about it.
 */
export async function startMatchClassificationRun(
  input: MatchClassificationRunStartInput,
): Promise<{ runId: string }> {
  const database = getDatabase();
  const id = randomUUID();
  await database.insert(matchClassificationRuns).values({
    id,
    itemId: input.itemId,
    provider: input.provider,
    model: input.model,
    listingCount: input.listingCount,
    startedAt: new Date(),
  });
  await logItemEvent({
    itemId: input.itemId,
    kind: ITEM_EVENT_KIND.MATCH_RUN,
    sourceTable: 'match_classification_runs',
    sourceId: id,
    summary: `Match classification · ${input.listingCount} listing${input.listingCount === 1 ? '' : 's'}`,
  });
  return { runId: id };
}

export async function completeMatchClassificationRun(
  input: MatchClassificationRunCompleteInput,
): Promise<void> {
  const database = getDatabase();
  await database
    .update(matchClassificationRuns)
    .set({
      outcome: input.outcome,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      response: input.response,
      errorMessage: input.errorMessage,
      completedAt: new Date(),
    })
    .where(eq(matchClassificationRuns.id, input.runId));
}
