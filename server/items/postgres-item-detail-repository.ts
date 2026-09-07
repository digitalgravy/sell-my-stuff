import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  comparableSales,
  factCorrections,
  identificationRuns,
  itemFacts,
  items,
  jobs,
  matchClassificationRuns,
  photos,
  researchCaptures,
} from '@/db/schema';
import { getAnthropicComparableMatchProvider } from '@/server/ai/anthropic-comparable-match-provider';
import { estimateCostUsd } from '@/server/ai/pricing';
import { getDatabase } from '@/server/db/client';
import { INSPECT_IMAGES_JOB_TYPE } from '@/server/jobs/inspect-images-job';
import { RESEARCH_COMPARABLE_SALES_JOB_TYPE } from '@/server/jobs/research-comparable-sales-job';

import { buildIdentityFactsForMatching, classifyComparableSales } from './comparable-match';
import { deriveActivityState } from './homepage-snapshot';
import { computeValuation } from './valuation';
import type {
  ComparableSale,
  CorrectFactOutcome,
  EvidenceInfo,
  ItemDetail,
  ItemDetailFact,
  ItemDetailPhoto,
  ItemDetailRepository,
  RegenerateResearchOutcome,
  RetryOutcome,
  UndoCorrectionOutcome,
} from './item-detail-repository';
import {
  buildStepsFromCorrections,
  buildStepsFromImports,
  buildStepsFromMatchRuns,
  buildStepsFromResearchJobs,
  buildStepsFromRuns,
  deriveAttention,
  derivePhases,
} from './item-detail-view-model';
import {
  completeMatchClassificationRun,
  startMatchClassificationRun,
} from './match-classification-runs';

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

    const [
      photoRows,
      factRows,
      runRows,
      matchRunRows,
      [job],
      comparableSaleRows,
      importRows,
      researchJobRows,
      correctionRows,
    ] = await Promise.all([
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
        .select({
          id: matchClassificationRuns.id,
          provider: matchClassificationRuns.provider,
          model: matchClassificationRuns.model,
          listingCount: matchClassificationRuns.listingCount,
          outcome: matchClassificationRuns.outcome,
          inputTokens: matchClassificationRuns.inputTokens,
          outputTokens: matchClassificationRuns.outputTokens,
          errorMessage: matchClassificationRuns.errorMessage,
          startedAt: matchClassificationRuns.startedAt,
          completedAt: matchClassificationRuns.completedAt,
        })
        .from(matchClassificationRuns)
        .where(eq(matchClassificationRuns.itemId, itemId))
        .orderBy(desc(matchClassificationRuns.startedAt)),
      database
        .select({ state: jobs.state, lastError: jobs.lastError })
        .from(jobs)
        .where(and(eq(jobs.itemId, itemId), eq(jobs.type, INSPECT_IMAGES_JOB_TYPE)))
        .orderBy(desc(jobs.updatedAt))
        .limit(1),
      database
        .select({
          id: comparableSales.id,
          title: comparableSales.title,
          match: comparableSales.match,
          soldAt: comparableSales.soldAt,
          price: comparableSales.price,
          excluded: comparableSales.excluded,
          excludedReason: comparableSales.excludedReason,
        })
        .from(comparableSales)
        .where(eq(comparableSales.itemId, itemId))
        .orderBy(desc(comparableSales.soldAt)),
      database
        .select({
          id: researchCaptures.id,
          sourceUrl: researchCaptures.sourceUrl,
          pageTitle: researchCaptures.pageTitle,
          extractedSales: researchCaptures.extractedSales,
          importedAt: researchCaptures.importedAt,
        })
        .from(researchCaptures)
        .where(eq(researchCaptures.importedIntoItemId, itemId))
        .orderBy(desc(researchCaptures.importedAt)),
      database
        .select({
          id: jobs.id,
          state: jobs.state,
          lastError: jobs.lastError,
          updatedAt: jobs.updatedAt,
        })
        .from(jobs)
        .where(and(eq(jobs.itemId, itemId), eq(jobs.type, RESEARCH_COMPARABLE_SALES_JOB_TYPE)))
        .orderBy(desc(jobs.updatedAt)),
      database
        .select({
          id: factCorrections.id,
          field: factCorrections.field,
          previousValue: factCorrections.previousValue,
          newValue: factCorrections.newValue,
          correctedAt: factCorrections.correctedAt,
        })
        .from(factCorrections)
        .where(and(eq(factCorrections.itemId, itemId), isNull(factCorrections.revertedAt)))
        .orderBy(desc(factCorrections.correctedAt)),
    ]);

    const comparableSaleList: ComparableSale[] = comparableSaleRows.map((row) => ({
      ...row,
      excludedReason: row.excludedReason ?? undefined,
    }));

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
    const ebaySearchUrlRaw = factRows.find((row) => row.field === 'research.ebay_search_url')?.value;
    const ebaySearchUrl =
      typeof ebaySearchUrlRaw === 'string' ? (parseFactValue(ebaySearchUrlRaw) as string) : undefined;

    const photoList: ItemDetailPhoto[] = photoRows.map((row, index) => ({
      id: row.id,
      url: `/api/items/${itemId}/photos/${row.id}`,
      label: `Photo ${index + 1}`,
      position: row.position,
    }));

    // Five independent sources of build-log entries (identification runs,
    // match-classification runs, comparable-sales imports, eBay-search-link
    // jobs, fact corrections) merged into one chronological list -- each
    // timestamped record keeps the source it came from so the right
    // builder function turns it into a BuildStep. A pending run (no
    // completedAt yet) sorts by its startedAt like everything else, so it
    // naturally appears at the top while in flight.
    const timestampedSteps = [
      ...runRows.map((row) => ({ at: row.startedAt, kind: 'run' as const, row })),
      ...matchRunRows.map((row) => ({ at: row.startedAt, kind: 'matchRun' as const, row })),
      ...importRows.map((row) => ({ at: row.importedAt!, kind: 'import' as const, row })),
      ...researchJobRows
        .filter((row) => row.state === 'SUCCEEDED' || row.state === 'FAILED')
        .map((row) => ({ at: row.updatedAt, kind: 'research' as const, row })),
      ...correctionRows.map((row) => ({ at: row.correctedAt, kind: 'correction' as const, row })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    const buildSteps = timestampedSteps.flatMap((entry) => {
      switch (entry.kind) {
        case 'run':
          return buildStepsFromRuns(
            [
              {
                id: entry.row.id,
                attempt: entry.row.attempt,
                provider: entry.row.provider,
                model: entry.row.model,
                outcome: entry.row.outcome ?? undefined,
                inputTokens: entry.row.inputTokens ?? undefined,
                outputTokens: entry.row.outputTokens ?? undefined,
                response: entry.row.response ?? undefined,
                errorMessage: entry.row.errorMessage ?? undefined,
                startedAt: entry.row.startedAt.toISOString(),
                completedAt: entry.row.completedAt?.toISOString(),
              },
            ],
            photoRows.length,
          );
        case 'matchRun':
          return buildStepsFromMatchRuns([
            {
              id: entry.row.id,
              provider: entry.row.provider,
              model: entry.row.model,
              listingCount: entry.row.listingCount,
              outcome: entry.row.outcome ?? undefined,
              inputTokens: entry.row.inputTokens ?? undefined,
              outputTokens: entry.row.outputTokens ?? undefined,
              errorMessage: entry.row.errorMessage ?? undefined,
              startedAt: entry.row.startedAt.toISOString(),
              completedAt: entry.row.completedAt?.toISOString(),
            },
          ]);
        case 'import':
          return buildStepsFromImports([
            {
              captureId: entry.row.id,
              sourceUrl: entry.row.sourceUrl,
              pageTitle: entry.row.pageTitle,
              importedCount: Array.isArray(entry.row.extractedSales)
                ? entry.row.extractedSales.length
                : 0,
              importedAt: entry.row.importedAt!.toISOString(),
            },
          ]);
        case 'research':
          return buildStepsFromResearchJobs([
            {
              id: entry.row.id,
              state: entry.row.state,
              lastError: entry.row.lastError,
              searchUrl: ebaySearchUrl,
            },
          ]);
        case 'correction':
          return buildStepsFromCorrections([
            {
              id: entry.row.id,
              field: entry.row.field,
              previousValue: entry.row.previousValue,
              newValue: entry.row.newValue,
              correctedAt: entry.row.correctedAt.toISOString(),
            },
          ]);
      }
    });

    // What this item has cost so far in Anthropic API spend across both
    // call types (identification, match classification) -- a real,
    // measured cost that nets against the estimated sale price, not a
    // fabricated marketplace-fee figure. Pending/failed runs with no
    // token counts contribute 0, not undefined, so this always sums cleanly.
    const aiCostUsd =
      runRows.reduce(
        (total, row) =>
          total + (estimateCostUsd(row.model, row.inputTokens ?? undefined, row.outputTokens ?? undefined) ?? 0),
        0,
      ) +
      matchRunRows.reduce(
        (total, row) =>
          total + (estimateCostUsd(row.model, row.inputTokens ?? undefined, row.outputTokens ?? undefined) ?? 0),
        0,
      );

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
      phases: derivePhases({
        status: item.status,
        hasIdentityFacts,
        hasEvidence: comparableSaleList.length > 0,
      }),
      attention: deriveAttention({
        status: item.status,
        openQuestions,
        lastError: job?.lastError ?? undefined,
        ebaySearchUrl,
        hasEvidence: comparableSaleList.length > 0,
      }),
      evidence: comparableSaleList.length > 0 ? buildEvidence(comparableSaleList) : undefined,
      pricing: computeValuation(comparableSaleList),
      aiCostUsd,
      buildSteps,
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

  async requestReidentification(itemId: string): Promise<RetryOutcome> {
    const database = getDatabase();
    return database.transaction(async (tx) => {
      const [item] = await tx
        .select({ status: items.status, revision: items.revision })
        .from(items)
        .where(eq(items.id, itemId));
      if (!item) return { ok: false, reason: 'Item not found' };
      if (item.status === 'IDENTIFYING') {
        return { ok: false, reason: 'Identification is already running' };
      }

      // A fresh job row, not a reset of any existing one -- prior attempts
      // (and their identification_runs / Build log entries) stay exactly
      // as they were; this one starts its own attempt count from zero.
      const newRevision = item.revision + 1;
      await tx.insert(jobs).values({
        id: randomUUID(),
        itemId,
        type: INSPECT_IMAGES_JOB_TYPE,
        idempotencyKey: `${INSPECT_IMAGES_JOB_TYPE}:${itemId}:${newRevision}`,
      });
      await tx
        .update(items)
        .set({ status: 'INBOX', revision: newRevision, updatedAt: new Date() })
        .where(eq(items.id, itemId));

      return { ok: true };
    });
  }

  async regenerateResearch(itemId: string): Promise<RegenerateResearchOutcome> {
    const database = getDatabase();
    const [item] = await database
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, itemId));
    if (!item) return { ok: false, reason: 'Item not found' };

    await database.insert(jobs).values({
      id: randomUUID(),
      itemId,
      type: RESEARCH_COMPARABLE_SALES_JOB_TYPE,
      idempotencyKey: `${RESEARCH_COMPARABLE_SALES_JOB_TYPE}:${itemId}:${randomUUID()}`,
    });

    return { ok: true };
  }

  async setSaleExcluded(
    itemId: string,
    saleId: string,
    excluded: boolean,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const database = getDatabase();
    const result = await database
      .update(comparableSales)
      .set({ excluded, excludedReason: null })
      .where(and(eq(comparableSales.id, saleId), eq(comparableSales.itemId, itemId)))
      .returning({ id: comparableSales.id });
    if (result.length === 0) return { ok: false, reason: 'Comparable sale not found' };
    return { ok: true };
  }

  async reclassifyEvidence(itemId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const database = getDatabase();

    const [item] = await database.select({ id: items.id }).from(items).where(eq(items.id, itemId));
    if (!item) return { ok: false, reason: 'Item not found' };

    const [identityFactRows, saleRows] = await Promise.all([
      database
        .select({ field: itemFacts.field, value: itemFacts.value })
        .from(itemFacts)
        .where(eq(itemFacts.itemId, itemId)),
      database
        .select({
          id: comparableSales.id,
          title: comparableSales.title,
          match: comparableSales.match,
          soldAt: comparableSales.soldAt,
          price: comparableSales.price,
        })
        .from(comparableSales)
        .where(eq(comparableSales.itemId, itemId)),
    ]);
    if (saleRows.length === 0) return { ok: false, reason: 'No comparable sales to re-check' };

    const identity = buildIdentityFactsForMatching(identityFactRows);
    const matchProvider = getAnthropicComparableMatchProvider();
    const { runId } = await startMatchClassificationRun({
      itemId,
      provider: matchProvider.provider,
      model: matchProvider.model,
      listingCount: saleRows.length,
    });

    let classification;
    try {
      classification = await classifyComparableSales(identity, saleRows, matchProvider);
    } catch (error) {
      await completeMatchClassificationRun({
        runId,
        outcome: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
    await completeMatchClassificationRun({
      runId,
      outcome: 'succeeded',
      inputTokens: classification.usage?.inputTokens,
      outputTokens: classification.usage?.outputTokens,
      response: classification.response,
    });

    await database.transaction(async (tx) => {
      for (const sale of classification.sales) {
        await tx
          .update(comparableSales)
          .set({ excluded: sale.excluded ?? false, excludedReason: sale.excludedReason ?? null })
          .where(eq(comparableSales.id, sale.id!));
      }
    });

    return { ok: true };
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

    const newValue = JSON.stringify(value);

    await database.transaction(async (tx) => {
      const [existing] = await tx
        .select({ value: itemFacts.value, origin: itemFacts.origin })
        .from(itemFacts)
        .where(and(eq(itemFacts.itemId, itemId), eq(itemFacts.field, field)));

      await tx.insert(factCorrections).values({
        id: randomUUID(),
        itemId,
        field,
        previousValue: existing?.value ?? null,
        previousOrigin: existing?.origin,
        newValue,
      });

      await tx
        .insert(itemFacts)
        .values({
          id: randomUUID(),
          itemId,
          field,
          value: newValue,
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
    });

    return { ok: true };
  }

  async undoCorrection(itemId: string, correctionId: string): Promise<UndoCorrectionOutcome> {
    const database = getDatabase();
    const [correction] = await database
      .select({
        itemId: factCorrections.itemId,
        field: factCorrections.field,
        previousValue: factCorrections.previousValue,
        previousOrigin: factCorrections.previousOrigin,
        revertedAt: factCorrections.revertedAt,
      })
      .from(factCorrections)
      .where(eq(factCorrections.id, correctionId));
    if (!correction || correction.itemId !== itemId || correction.revertedAt) {
      return { ok: false, reason: 'Correction not found' };
    }

    await database.transaction(async (tx) => {
      if (correction.previousValue !== null && correction.previousOrigin) {
        await tx
          .update(itemFacts)
          .set({
            value: correction.previousValue,
            origin: correction.previousOrigin,
            retrievedAt: new Date(),
          })
          .where(and(eq(itemFacts.itemId, itemId), eq(itemFacts.field, correction.field)));
      } else {
        await tx
          .delete(itemFacts)
          .where(and(eq(itemFacts.itemId, itemId), eq(itemFacts.field, correction.field)));
      }
      await tx
        .update(factCorrections)
        .set({ revertedAt: new Date() })
        .where(eq(factCorrections.id, correctionId));
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

function buildEvidence(rows: readonly ComparableSale[]): EvidenceInfo {
  const included = rows.filter((row) => !row.excluded);
  const fairValue =
    included.length > 0
      ? Math.round((included.reduce((sum, row) => sum + row.price, 0) / included.length) * 100) / 100
      : 0;
  return {
    sales: rows.map((row) => ({ ...row })),
    fairValue,
    note: `Based on ${included.length} comparable sale${included.length === 1 ? '' : 's'} imported from a captured eBay search page.`,
  };
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
