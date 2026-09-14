import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { listingDraftRuns } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import { ITEM_EVENT_KIND, logItemEvent } from './item-events';

export interface ListingDraftRunStartInput {
  itemId: string;
  provider: string;
  model: string;
}

export interface ListingDraftRunCompleteInput {
  runId: string;
  outcome: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
}

/**
 * Logged before the request goes to Anthropic, so the Build log can show a
 * pending entry -- see startAnswerResolutionRun for the same pattern.
 */
export async function startListingDraftRun(
  input: ListingDraftRunStartInput,
): Promise<{ runId: string; eventId: string }> {
  const database = getDatabase();
  const id = randomUUID();
  await database.insert(listingDraftRuns).values({
    id,
    itemId: input.itemId,
    provider: input.provider,
    model: input.model,
    startedAt: new Date(),
  });
  const { id: eventId } = await logItemEvent({
    itemId: input.itemId,
    kind: ITEM_EVENT_KIND.LISTING_DRAFT_RUN,
    sourceTable: 'listing_draft_runs',
    sourceId: id,
    summary: 'Generated listing draft',
  });
  return { runId: id, eventId };
}

export async function completeListingDraftRun(
  input: ListingDraftRunCompleteInput,
): Promise<void> {
  const database = getDatabase();
  await database
    .update(listingDraftRuns)
    .set({
      outcome: input.outcome,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      response: input.response,
      errorMessage: input.errorMessage,
      completedAt: new Date(),
    })
    .where(eq(listingDraftRuns.id, input.runId));
}
