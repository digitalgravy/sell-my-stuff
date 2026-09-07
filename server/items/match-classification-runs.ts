import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { matchClassificationRuns } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

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

/** Logged before the request goes to Anthropic, so the Build log can show a pending entry -- see identificationRuns for the same pattern. */
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
