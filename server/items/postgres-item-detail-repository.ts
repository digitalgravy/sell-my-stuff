import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { identificationRuns, itemFacts, items, jobs, photos } from '@/db/schema';
import { getDatabase } from '@/server/db/client';
import { INSPECT_IMAGES_JOB_TYPE } from '@/server/jobs/inspect-images-job';

import { deriveActivityState } from './homepage-snapshot';
import type {
  CorrectFactOutcome,
  ItemDetail,
  ItemDetailFact,
  ItemDetailPhoto,
  ItemDetailRepository,
  RetryOutcome,
} from './item-detail-repository';
import { buildStepsFromRuns, deriveAttention, derivePhases } from './item-detail-view-model';

const IDENTITY_FACT_FIELDS = new Set([
  'identity.item_type',
  'identity.manufacturer',
  'identity.family',
  'identity.model',
  'identity.model_numbers',
  'identity.colour',
]);

export class PostgresItemDetailRepository implements ItemDetailRepository {
  async getItemDetail(itemId: string): Promise<ItemDetail | null> {
    const database = getDatabase();

    const [item] = await database
      .select({
        id: items.id,
        status: items.status,
        createdAt: items.createdAt,
        updatedAt: items.updatedAt,
      })
      .from(items)
      .where(eq(items.id, itemId));
    if (!item) return null;

    const [photoRows, factRows, runRows, [job]] = await Promise.all([
      database
        .select({ id: photos.id, position: photos.position })
        .from(photos)
        .where(eq(photos.itemId, itemId))
        .orderBy(asc(photos.position)),
      database
        .select({
          field: itemFacts.field,
          value: itemFacts.value,
          confidence: itemFacts.confidence,
          origin: itemFacts.origin,
          evidence: itemFacts.evidence,
          retrievedAt: itemFacts.retrievedAt,
        })
        .from(itemFacts)
        .where(eq(itemFacts.itemId, itemId))
        .orderBy(asc(itemFacts.field)),
      database
        .select({
          id: identificationRuns.id,
          attempt: identificationRuns.attempt,
          provider: identificationRuns.provider,
          model: identificationRuns.model,
          outcome: identificationRuns.outcome,
          inputTokens: identificationRuns.inputTokens,
          outputTokens: identificationRuns.outputTokens,
          response: identificationRuns.response,
          errorMessage: identificationRuns.errorMessage,
          startedAt: identificationRuns.startedAt,
          completedAt: identificationRuns.completedAt,
        })
        .from(identificationRuns)
        .where(eq(identificationRuns.itemId, itemId))
        .orderBy(desc(identificationRuns.startedAt)),
      database
        .select({ state: jobs.state, lastError: jobs.lastError })
        .from(jobs)
        .where(and(eq(jobs.itemId, itemId), eq(jobs.type, INSPECT_IMAGES_JOB_TYPE)))
        .orderBy(desc(jobs.updatedAt))
        .limit(1),
    ]);

    const facts: ItemDetailFact[] = factRows.map((row) => ({
      field: row.field,
      value: parseFactValue(row.value),
      confidence: row.confidence,
      origin: row.origin,
      evidence: row.evidence ?? undefined,
      retrievedAt: row.retrievedAt.toISOString(),
    }));

    const hasIdentityFacts = factRows.some((row) => IDENTITY_FACT_FIELDS.has(row.field));
    const openQuestions = parseStringArray(
      factRows.find((row) => row.field === 'identity.open_questions')?.value,
    );

    const photoList: ItemDetailPhoto[] = photoRows.map((row, index) => ({
      id: row.id,
      url: `/api/items/${itemId}/photos/${row.id}`,
      label: `Photo ${index + 1}`,
      position: row.position,
    }));

    return {
      id: item.id,
      status: item.status,
      activity:
        item.status === 'NEEDS_INFORMATION'
          ? undefined
          : deriveActivityState({ status: item.status, jobState: job?.state }),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      photos: photoList,
      facts,
      phases: derivePhases({ status: item.status, hasIdentityFacts }),
      attention: deriveAttention({
        status: item.status,
        openQuestions,
        lastError: job?.lastError ?? undefined,
      }),
      buildSteps: buildStepsFromRuns(
        runRows.map((row) => ({
          id: row.id,
          attempt: row.attempt,
          provider: row.provider,
          model: row.model,
          outcome: row.outcome,
          inputTokens: row.inputTokens ?? undefined,
          outputTokens: row.outputTokens ?? undefined,
          response: row.response ?? undefined,
          errorMessage: row.errorMessage ?? undefined,
          startedAt: row.startedAt.toISOString(),
          completedAt: row.completedAt.toISOString(),
        })),
        photoRows.length,
      ),
    };
  }

  async getPhotoForItem(
    itemId: string,
    photoId: string,
  ): Promise<{ objectKey: string; mediaType: string } | null> {
    const database = getDatabase();
    const [photo] = await database
      .select({ objectKey: photos.objectKey, mediaType: photos.mediaType })
      .from(photos)
      .where(and(eq(photos.id, photoId), eq(photos.itemId, itemId)));
    return photo ?? null;
  }

  async retryFailedItem(itemId: string): Promise<RetryOutcome> {
    const database = getDatabase();
    return database.transaction(async (tx) => {
      const [item] = await tx
        .select({ status: items.status })
        .from(items)
        .where(eq(items.id, itemId));
      if (!item) return { ok: false, reason: 'Item not found' };
      if (item.status !== 'FAILED') {
        return { ok: false, reason: 'Item is not in a failed state' };
      }

      const [job] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(eq(jobs.itemId, itemId), eq(jobs.type, INSPECT_IMAGES_JOB_TYPE)),
        );
      if (!job) return { ok: false, reason: 'No job found to retry' };

      await tx
        .update(jobs)
        .set({
          state: 'QUEUED',
          attempt: 0,
          availableAt: new Date(),
          lockedAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      await tx
        .update(items)
        .set({
          status: 'INBOX',
          revision: sql`${items.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(items.id, itemId));

      return { ok: true };
    });
  }

  async correctFact(
    itemId: string,
    field: string,
    value: string,
  ): Promise<CorrectFactOutcome> {
    const database = getDatabase();
    const [item] = await database
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, itemId));
    if (!item) return { ok: false, reason: 'Item not found' };

    await database
      .insert(itemFacts)
      .values({
        id: randomUUID(),
        itemId,
        field,
        value: JSON.stringify(value),
        confidence: 1,
        origin: 'user_confirmed',
      })
      .onConflictDoUpdate({
        target: [itemFacts.itemId, itemFacts.field],
        set: {
          value: sql`excluded.value`,
          confidence: sql`excluded.confidence`,
          origin: sql`excluded.origin`,
          retrievedAt: sql`now()`,
        },
      });

    return { ok: true };
  }

  async deleteItem(itemId: string): Promise<{ ok: boolean }> {
    const database = getDatabase();
    const result = await database
      .delete(items)
      .where(eq(items.id, itemId))
      .returning({ id: items.id });
    return { ok: result.length > 0 };
  }
}

function parseFactValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

function parseStringArray(rawValue: string | undefined): string[] {
  if (!rawValue) return [];
  try {
    const parsed: unknown = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}
