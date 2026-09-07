import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import {
  answerResolutionRuns,
  comparableSales,
  conditionAssessmentRuns,
  factCorrections,
  identificationRuns,
  itemEvents,
  itemFacts,
  items,
  jobs,
  matchClassificationRuns,
  photos,
  researchCaptures,
} from '@/db/schema';
import type { FactAnswerInput } from '@/server/ai/answer-resolution-provider';
import { getAnthropicAnswerResolutionProvider } from '@/server/ai/anthropic-answer-resolution-provider';
import { getAnthropicComparableMatchProvider } from '@/server/ai/anthropic-comparable-match-provider';
import { estimateCostUsd, usdToGbp } from '@/server/ai/pricing';
import { getDatabase } from '@/server/db/client';
import { INSPECT_IMAGES_JOB_TYPE } from '@/server/jobs/inspect-images-job';
import { RESEARCH_COMPARABLE_SALES_JOB_TYPE } from '@/server/jobs/research-comparable-sales-job';

import {
  completeAnswerResolutionRun,
  startAnswerResolutionRun,
} from './answer-resolution-runs';
import { buildIdentityFactsForMatching, classifyComparableSales } from './comparable-match';
import { computeProceedsBreakdown } from './fees';
import { deriveActivityState } from './homepage-snapshot';
import {
  deleteItemEventBySource,
  ITEM_EVENT_KIND,
  logItemEvent,
  setItemEventDetail,
} from './item-events';
import type {
  BuildStep,
  ComparableSale,
  ConfirmFactOutcome,
  CorrectFactOutcome,
  EvidenceInfo,
  FactAnswerSubmission,
  ItemDetail,
  ItemDetailFact,
  ItemDetailPhoto,
  ItemDetailRepository,
  RegenerateResearchOutcome,
  ResolveFactAnswersOutcome,
  RetryOutcome,
  UndoCorrectionOutcome,
} from './item-detail-repository';
import {
  buildStepFromSimpleEvent,
  buildStepsFromAnswerResolutionRuns,
  buildStepsFromConditionRuns,
  buildStepsFromCorrections,
  buildStepsFromImports,
  buildStepsFromMatchRuns,
  buildStepsFromRuns,
  deriveAttention,
  derivePhases,
  type AnswerResolutionChange,
} from './item-detail-view-model';
import {
  completeMatchClassificationRun,
  startMatchClassificationRun,
} from './match-classification-runs';
import { computeValuation } from './valuation';

const IDENTITY_FACT_FIELDS = new Set([
  'identity.item_type',
  'identity.manufacturer',
  'identity.family',
  'identity.model',
  'identity.model_numbers',
  'identity.colour',
]);

const CONDITION_FACT_FIELDS = new Set([
  'condition.overall_grade',
  'condition.functional_status',
  'condition.cosmetic_wear',
  'condition.defects',
  'condition.missing_parts',
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
      eventRows,
      runRows,
      conditionRunRows,
      matchRunRows,
      answerResolutionRunRows,
      [job],
      comparableSaleRows,
      captureRows,
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
          id: itemEvents.id,
          sequence: itemEvents.sequence,
          kind: itemEvents.kind,
          sourceTable: itemEvents.sourceTable,
          sourceId: itemEvents.sourceId,
          summary: itemEvents.summary,
          detail: itemEvents.detail,
          createdAt: itemEvents.createdAt,
        })
        .from(itemEvents)
        .where(eq(itemEvents.itemId, itemId))
        .orderBy(desc(itemEvents.sequence)),
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
          id: conditionAssessmentRuns.id,
          attempt: conditionAssessmentRuns.attempt,
          provider: conditionAssessmentRuns.provider,
          model: conditionAssessmentRuns.model,
          outcome: conditionAssessmentRuns.outcome,
          inputTokens: conditionAssessmentRuns.inputTokens,
          outputTokens: conditionAssessmentRuns.outputTokens,
          response: conditionAssessmentRuns.response,
          errorMessage: conditionAssessmentRuns.errorMessage,
          startedAt: conditionAssessmentRuns.startedAt,
          completedAt: conditionAssessmentRuns.completedAt,
        })
        .from(conditionAssessmentRuns)
        .where(eq(conditionAssessmentRuns.itemId, itemId))
        .orderBy(desc(conditionAssessmentRuns.startedAt)),
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
        .select({
          id: answerResolutionRuns.id,
          provider: answerResolutionRuns.provider,
          model: answerResolutionRuns.model,
          answerCount: answerResolutionRuns.answerCount,
          outcome: answerResolutionRuns.outcome,
          inputTokens: answerResolutionRuns.inputTokens,
          outputTokens: answerResolutionRuns.outputTokens,
          errorMessage: answerResolutionRuns.errorMessage,
          startedAt: answerResolutionRuns.startedAt,
          completedAt: answerResolutionRuns.completedAt,
        })
        .from(answerResolutionRuns)
        .where(eq(answerResolutionRuns.itemId, itemId)),
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
        })
        .from(researchCaptures)
        .where(eq(researchCaptures.importedIntoItemId, itemId)),
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
    const hasConditionFacts = factRows.some((row) => CONDITION_FACT_FIELDS.has(row.field));
    // Kept separate, not merged -- identity open questions gate research
    // (NEEDS_INFORMATION), condition ones deliberately don't (see
    // inspect-images-job.ts), and deriveAttention needs to know which is
    // which to render the latter as non-blocking tasks.
    const openQuestions = parseStringArray(
      factRows.find((row) => row.field === 'identity.open_questions')?.value,
    );
    const conditionOpenQuestions = parseStringArray(
      factRows.find((row) => row.field === 'condition.open_questions')?.value,
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

    // item_events is now the single source of the Build log (see its doc
    // comment in db/schema.ts) -- one query, already in the right order
    // (newest first, by the stable `sequence` assigned at creation).
    // Renderers that need full detail (system prompt, raw response) join
    // back into the specialized run tables by sourceId; everything else
    // renders straight from the event's own summary/detail.
    const identificationRunById = new Map(runRows.map((row) => [row.id, row]));
    const conditionRunById = new Map(conditionRunRows.map((row) => [row.id, row]));
    const matchRunById = new Map(matchRunRows.map((row) => [row.id, row]));
    const answerResolutionRunById = new Map(answerResolutionRunRows.map((row) => [row.id, row]));
    const captureById = new Map(captureRows.map((row) => [row.id, row]));

    const buildSteps = eventRows.flatMap((event): BuildStep[] => {
      switch (event.kind) {
        case ITEM_EVENT_KIND.IDENTIFICATION_RUN: {
          const run = event.sourceId ? identificationRunById.get(event.sourceId) : undefined;
          if (!run) return [];
          return buildStepsFromRuns(
            [
              {
                id: event.id,
                sequence: event.sequence,
                attempt: run.attempt,
                provider: run.provider,
                model: run.model,
                outcome: run.outcome ?? undefined,
                inputTokens: run.inputTokens ?? undefined,
                outputTokens: run.outputTokens ?? undefined,
                response: run.response ?? undefined,
                errorMessage: run.errorMessage ?? undefined,
                startedAt: run.startedAt.toISOString(),
                completedAt: run.completedAt?.toISOString(),
              },
            ],
            photoRows.length,
          );
        }
        case ITEM_EVENT_KIND.CONDITION_RUN: {
          const run = event.sourceId ? conditionRunById.get(event.sourceId) : undefined;
          if (!run) return [];
          return buildStepsFromConditionRuns(
            [
              {
                id: event.id,
                sequence: event.sequence,
                attempt: run.attempt,
                provider: run.provider,
                model: run.model,
                outcome: run.outcome ?? undefined,
                inputTokens: run.inputTokens ?? undefined,
                outputTokens: run.outputTokens ?? undefined,
                response: run.response ?? undefined,
                errorMessage: run.errorMessage ?? undefined,
                startedAt: run.startedAt.toISOString(),
                completedAt: run.completedAt?.toISOString(),
              },
            ],
            photoRows.length,
          );
        }
        case ITEM_EVENT_KIND.MATCH_RUN: {
          const run = event.sourceId ? matchRunById.get(event.sourceId) : undefined;
          if (!run) return [];
          return buildStepsFromMatchRuns([
            {
              id: event.id,
              sequence: event.sequence,
              provider: run.provider,
              model: run.model,
              listingCount: run.listingCount,
              outcome: run.outcome ?? undefined,
              inputTokens: run.inputTokens ?? undefined,
              outputTokens: run.outputTokens ?? undefined,
              errorMessage: run.errorMessage ?? undefined,
              startedAt: run.startedAt.toISOString(),
              completedAt: run.completedAt?.toISOString(),
            },
          ]);
        }
        case ITEM_EVENT_KIND.ANSWERS_RESOLVED: {
          const run = event.sourceId ? answerResolutionRunById.get(event.sourceId) : undefined;
          if (!run) return [];
          const detail = event.detail as { changes?: AnswerResolutionChange[] } | null;
          return buildStepsFromAnswerResolutionRuns([
            {
              id: event.id,
              sequence: event.sequence,
              provider: run.provider,
              model: run.model,
              answerCount: run.answerCount,
              outcome: run.outcome ?? undefined,
              inputTokens: run.inputTokens ?? undefined,
              outputTokens: run.outputTokens ?? undefined,
              errorMessage: run.errorMessage ?? undefined,
              startedAt: run.startedAt.toISOString(),
              completedAt: run.completedAt?.toISOString(),
              changes: detail?.changes,
            },
          ]);
        }
        case ITEM_EVENT_KIND.COMPARABLE_SALES_IMPORTED: {
          const detail = event.detail as { count?: number } | null;
          const capture =
            event.sourceTable === 'research_captures' && event.sourceId
              ? captureById.get(event.sourceId)
              : undefined;
          return buildStepsFromImports([
            {
              id: event.id,
              sequence: event.sequence,
              captureId: event.sourceTable === 'research_captures' ? (event.sourceId ?? undefined) : undefined,
              sourceUrl: capture?.sourceUrl ?? null,
              pageTitle: capture?.pageTitle ?? null,
              importedCount: detail?.count ?? 0,
              importedAt: event.createdAt.toISOString(),
            },
          ]);
        }
        case ITEM_EVENT_KIND.FACT_CORRECTED: {
          const detail = event.detail as { field?: string; previousValue?: string | null; newValue?: string } | null;
          if (!detail?.field || detail.newValue === undefined) return [];
          return buildStepsFromCorrections([
            {
              id: event.id,
              sequence: event.sequence,
              correctionId: event.sourceId ?? event.id,
              field: detail.field,
              previousValue: detail.previousValue ?? null,
              newValue: detail.newValue,
              correctedAt: event.createdAt.toISOString(),
            },
          ]);
        }
        default:
          return [
            buildStepFromSimpleEvent({
              id: event.id,
              sequence: event.sequence,
              kind: event.kind,
              summary: event.summary,
              detail: event.detail,
            }),
          ];
      }
    });

    // What this item has cost so far in Anthropic API spend across all four
    // call types (identification, condition assessment, match
    // classification, answer resolution) -- a real, measured cost that
    // nets against the estimated sale price, not a fabricated
    // marketplace-fee figure. Pending/failed runs with no token counts
    // contribute 0, not undefined, so this always sums cleanly.
    const sumRunCosts = (rows: { model: string; inputTokens: number | null; outputTokens: number | null }[]) =>
      rows.reduce(
        (total, row) =>
          total + (estimateCostUsd(row.model, row.inputTokens ?? undefined, row.outputTokens ?? undefined) ?? 0),
        0,
      );
    const aiCostUsd =
      sumRunCosts(runRows) +
      sumRunCosts(conditionRunRows) +
      sumRunCosts(matchRunRows) +
      sumRunCosts(answerResolutionRunRows);
    const pricing = computeValuation(comparableSaleList);

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
        hasConditionFacts,
        hasEvidence: comparableSaleList.length > 0,
      }),
      attention: deriveAttention({
        status: item.status,
        openQuestions,
        conditionOpenQuestions,
        lastError: job?.lastError ?? undefined,
        ebaySearchUrl,
        hasEvidence: comparableSaleList.length > 0,
      }),
      evidence: comparableSaleList.length > 0 ? buildEvidence(comparableSaleList) : undefined,
      pricing,
      proceeds: pricing
        ? computeProceedsBreakdown(pricing.buyItNowPrice, usdToGbp(aiCostUsd))
        : undefined,
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
      await logItemEvent(
        {
          itemId,
          kind: ITEM_EVENT_KIND.IDENTIFICATION_RETRIED,
          summary: 'Manually retried identification',
        },
        tx,
      );

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
    await logItemEvent({
      itemId,
      kind: ITEM_EVENT_KIND.RESEARCH_REGENERATED,
      summary: 'Manually regenerated eBay search research',
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
      .returning({ id: comparableSales.id, title: comparableSales.title });
    if (result.length === 0) return { ok: false, reason: 'Comparable sale not found' };
    await logItemEvent({
      itemId,
      kind: ITEM_EVENT_KIND.SALE_EXCLUDED_TOGGLED,
      summary: `Manually marked "${result[0]!.title}" as ${excluded ? 'excluded from' : 'included in'} pricing`,
      detail: { saleId, excluded, saleTitle: result[0]!.title },
    });
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

      const correctionId = randomUUID();
      await tx.insert(factCorrections).values({
        id: correctionId,
        itemId,
        field,
        previousValue: existing?.value ?? null,
        previousOrigin: existing?.origin,
        newValue,
      });
      await logItemEvent(
        {
          itemId,
          kind: ITEM_EVENT_KIND.FACT_CORRECTED,
          sourceTable: 'fact_corrections',
          sourceId: correctionId,
          summary: `Corrected ${field}`,
          // Raw JSON-encoded strings, matching fact_corrections' own
          // previousValue/newValue columns -- see
          // buildStepsFromCorrections' existing display convention.
          detail: { field, previousValue: existing?.value ?? null, newValue },
        },
        tx,
      );

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

  async confirmFact(itemId: string, field: string): Promise<ConfirmFactOutcome> {
    const database = getDatabase();
    const [existing] = await database
      .select({ value: itemFacts.value, confidence: itemFacts.confidence })
      .from(itemFacts)
      .where(and(eq(itemFacts.itemId, itemId), eq(itemFacts.field, field)));
    if (!existing) return { ok: false, reason: 'Fact not found' };

    await database
      .update(itemFacts)
      .set({ confidence: 1, origin: 'user_confirmed', retrievedAt: new Date() })
      .where(and(eq(itemFacts.itemId, itemId), eq(itemFacts.field, field)));
    await logItemEvent({
      itemId,
      kind: ITEM_EVENT_KIND.FACT_CONFIRMED,
      summary: `Confirmed ${field}`,
      detail: { field, value: existing.value, previousConfidence: existing.confidence },
    });
    return { ok: true };
  }

  async resolveFactAnswers(
    itemId: string,
    answers: FactAnswerSubmission[],
  ): Promise<ResolveFactAnswersOutcome> {
    if (answers.length === 0) return { ok: false, reason: 'No answers were given' };
    const database = getDatabase();

    const rows = await database
      .select({
        field: itemFacts.field,
        value: itemFacts.value,
        confidence: itemFacts.confidence,
        evidence: itemFacts.evidence,
      })
      .from(itemFacts)
      .where(eq(itemFacts.itemId, itemId));
    const factByField = new Map(rows.map((row) => [row.field, row]));

    const provider = getAnthropicAnswerResolutionProvider();
    const inputs: FactAnswerInput[] = answers.map((answer) => {
      const existing = factByField.get(answer.field);
      return {
        field: answer.field,
        currentValue: existing ? formatFactValueForPrompt(existing.value) : '(not yet recorded)',
        evidence: existing?.evidence ?? undefined,
        question: answer.question,
        answer: answer.answer,
      };
    });

    const { runId, eventId } = await startAnswerResolutionRun({
      itemId,
      provider: provider.provider,
      model: provider.model,
      answerCount: inputs.length,
    });

    let outcome;
    try {
      outcome = await provider.resolve(inputs);
    } catch (error) {
      await completeAnswerResolutionRun({
        runId,
        outcome: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      return { ok: false, reason: 'Could not resolve these answers' };
    }
    await completeAnswerResolutionRun({
      runId,
      outcome: 'succeeded',
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      response: outcome.result,
    });

    const changes: {
      field: string;
      previousValue: string | null;
      newValue: string;
      previousConfidence?: number;
      confidence: number;
    }[] = [];
    await database.transaction(async (tx) => {
      for (const resolved of outcome.result.facts) {
        const existing = factByField.get(resolved.field);
        const newValue = JSON.stringify(resolved.value);
        await tx
          .insert(itemFacts)
          .values({
            id: randomUUID(),
            itemId,
            field: resolved.field,
            value: newValue,
            confidence: resolved.confidence,
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
        changes.push({
          field: resolved.field,
          previousValue: existing?.value ?? null,
          newValue,
          previousConfidence: existing?.confidence,
          confidence: resolved.confidence,
        });
      }
      await setItemEventDetail(eventId, { changes }, tx);
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
      // Matches the capture-import undo behaviour: an undone action drops
      // out of the Build log entirely rather than showing a stale entry.
      await deleteItemEventBySource('fact_corrections', correctionId, tx);
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

/** A clean, human-readable rendering of a raw JSON-encoded fact value for an LLM prompt -- no quotes around a plain string, no noisy escaping. */
function formatFactValueForPrompt(rawValue: string): string {
  const parsed = parseFactValue(rawValue);
  if (Array.isArray(parsed)) return parsed.join(', ');
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
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
