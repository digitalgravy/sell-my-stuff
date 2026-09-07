import { randomUUID } from 'node:crypto';

import { eq, inArray, sql } from 'drizzle-orm';

import { comparableSales, identificationRuns, itemFacts, items, jobs, photos } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import {
  completeMatchClassificationRun as completeMatchClassificationRunRow,
  startMatchClassificationRun as startMatchClassificationRunRow,
} from './match-classification-runs';
import type {
  ClaimedJob,
  ComparableSaleInput,
  IdentificationFactInput,
  IdentificationRunCompleteInput,
  IdentificationRunStartInput,
  ItemPhotoForResearch,
  ItemStatusValue,
  MatchClassificationRunCompleteInput,
  MatchClassificationRunStartInput,
  ResearchJobRepository,
} from './research-repository';

interface ClaimedJobRow extends Record<string, unknown> {
  id: string;
  item_id: string;
  type: string;
  attempt: number;
}

export class PostgresResearchJobRepository implements ResearchJobRepository {
  async claimNextJob(
    type: string,
    maxAttempts: number,
    leaseMs: number,
  ): Promise<ClaimedJob | null> {
    const database = getDatabase();

    await database.execute(sql`
      UPDATE jobs
      SET state = 'FAILED',
          locked_at = NULL,
          last_error = 'Worker lease expired after the final attempt',
          updated_at = now()
      WHERE type = ${type}
        AND state = 'RUNNING'
        AND attempt >= ${maxAttempts}
        AND locked_at < now() - (${leaseMs} * interval '1 millisecond')
    `);

    const rows = await database.execute<ClaimedJobRow>(sql`
      UPDATE jobs
      SET state = 'RUNNING',
          attempt = attempt + 1,
          locked_at = now(),
          updated_at = now()
      WHERE id = (
        SELECT id FROM jobs
        WHERE type = ${type}
          AND attempt < ${maxAttempts}
          AND (
            (state = 'QUEUED' AND available_at <= now())
            OR (
              state = 'RUNNING'
              AND locked_at < now() - (${leaseMs} * interval '1 millisecond')
            )
          )
        ORDER BY available_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, item_id, type, attempt
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      itemId: row.item_id,
      type: row.type,
      attempt: row.attempt,
    };
  }

  async getItemPhotos(itemId: string): Promise<ItemPhotoForResearch[]> {
    const database = getDatabase();
    const rows = await database
      .select({
        id: photos.id,
        objectKey: photos.objectKey,
        mediaType: photos.mediaType,
      })
      .from(photos)
      .where(sql`${photos.itemId} = ${itemId}`)
      .orderBy(photos.position);
    return rows;
  }

  async saveIdentificationFacts(
    itemId: string,
    facts: IdentificationFactInput[],
  ): Promise<void> {
    if (facts.length === 0) return;
    const database = getDatabase();
    await database
      .insert(itemFacts)
      .values(
        facts.map((fact) => ({
          id: randomUUID(),
          itemId,
          field: fact.field,
          value: fact.value,
          confidence: fact.confidence,
          origin: fact.origin,
          evidence: fact.evidence,
          source: fact.source,
        })),
      )
      .onConflictDoUpdate({
        target: [itemFacts.itemId, itemFacts.field],
        set: {
          value: sql`excluded.value`,
          confidence: sql`excluded.confidence`,
          origin: sql`excluded.origin`,
          evidence: sql`excluded.evidence`,
          source: sql`excluded.source`,
          retrievedAt: sql`now()`,
        },
      });
  }

  async startIdentificationRun(
    entry: IdentificationRunStartInput,
  ): Promise<{ runId: string }> {
    const database = getDatabase();
    const id = randomUUID();
    await database.insert(identificationRuns).values({
      id,
      itemId: entry.itemId,
      jobId: entry.jobId,
      attempt: entry.attempt,
      provider: entry.provider,
      model: entry.model,
      startedAt: entry.startedAt,
    });
    return { runId: id };
  }

  async completeIdentificationRun(entry: IdentificationRunCompleteInput): Promise<void> {
    const database = getDatabase();
    await database
      .update(identificationRuns)
      .set({
        outcome: entry.outcome,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        response: entry.response,
        errorMessage: entry.errorMessage,
        completedAt: entry.completedAt,
      })
      .where(eq(identificationRuns.id, entry.runId));
  }

  async markPhotosInspected(photoIds: string[]): Promise<void> {
    if (photoIds.length === 0) return;
    const database = getDatabase();
    await database
      .update(photos)
      .set({ status: 'READY' })
      .where(inArray(photos.id, photoIds));
  }

  async transitionItemStatus(
    itemId: string,
    status: ItemStatusValue,
  ): Promise<void> {
    const database = getDatabase();
    await database
      .update(items)
      .set({
        status,
        revision: sql`${items.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(sql`${items.id} = ${itemId}`);
  }

  async completeJob(jobId: string, progress: number): Promise<void> {
    const database = getDatabase();
    await database
      .update(jobs)
      .set({
        state: 'SUCCEEDED',
        progress,
        lockedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(sql`${jobs.id} = ${jobId}`);
  }

  async failJob(
    jobId: string,
    error: string,
    outcome: 'RETRY' | 'FAILED',
    retryAt?: Date,
  ): Promise<void> {
    const database = getDatabase();
    await database
      .update(jobs)
      .set({
        state: outcome === 'RETRY' ? 'QUEUED' : 'FAILED',
        availableAt: retryAt ?? new Date(),
        lockedAt: null,
        lastError: error,
        updatedAt: new Date(),
      })
      .where(sql`${jobs.id} = ${jobId}`);
  }

  async getIdentityFacts(itemId: string): Promise<{ field: string; value: string }[]> {
    const database = getDatabase();
    return database
      .select({ field: itemFacts.field, value: itemFacts.value })
      .from(itemFacts)
      .where(eq(itemFacts.itemId, itemId));
  }

  async enqueueJob(input: {
    itemId: string;
    type: string;
    idempotencyKey: string;
  }): Promise<void> {
    const database = getDatabase();
    await database
      .insert(jobs)
      .values({
        id: randomUUID(),
        itemId: input.itemId,
        type: input.type,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: jobs.idempotencyKey });
  }

  async saveComparableSales(itemId: string, sales: ComparableSaleInput[]): Promise<void> {
    if (sales.length === 0) return;
    const database = getDatabase();
    await database.insert(comparableSales).values(
      sales.map((sale) => ({
        id: randomUUID(),
        itemId,
        title: sale.title,
        match: sale.match,
        soldAt: sale.soldAt,
        price: sale.price,
        excluded: sale.excluded ?? false,
        excludedReason: sale.excludedReason ?? null,
      })),
    );
  }

  async startMatchClassificationRun(
    entry: MatchClassificationRunStartInput,
  ): Promise<{ runId: string }> {
    return startMatchClassificationRunRow(entry);
  }

  async completeMatchClassificationRun(
    entry: MatchClassificationRunCompleteInput,
  ): Promise<void> {
    return completeMatchClassificationRunRow(entry);
  }
}
