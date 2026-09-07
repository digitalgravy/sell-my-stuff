import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { getAnthropicComparableMatchProvider } from '@/server/ai/anthropic-comparable-match-provider';
import { comparableSales, itemFacts, items, researchCaptures } from '@/db/schema';
import { getDatabase } from '@/server/db/client';
import { extractComparableSalesFromHtml, extractPageTitle } from '@/server/research/sold-listings-html';

import type {
  CaptureInboxRepository,
  ImportCaptureOutcome,
  PendingCapture,
  SaveCaptureResult,
  UndoImportOutcome,
} from './capture-inbox-repository';
import { buildIdentityFactsForMatching, classifyComparableSales } from './comparable-match';
import type { ComparableSale } from './item-detail-repository';
import { deleteItemEventBySource, ITEM_EVENT_KIND, logItemEvent } from './item-events';
import {
  completeMatchClassificationRun,
  startMatchClassificationRun,
} from './match-classification-runs';

export class PostgresCaptureInboxRepository implements CaptureInboxRepository {
  async saveCapture(html: string, sourceUrl: string | null): Promise<SaveCaptureResult> {
    const database = getDatabase();
    const extractedSales = extractComparableSalesFromHtml(html);
    const id = randomUUID();

    await database.insert(researchCaptures).values({
      id,
      sourceUrl,
      pageTitle: extractPageTitle(html) ?? null,
      html,
      extractedSales,
    });

    return { id, extractedCount: extractedSales.length };
  }

  async listPendingCaptures(): Promise<PendingCapture[]> {
    const database = getDatabase();
    const rows = await database
      .select({
        id: researchCaptures.id,
        sourceUrl: researchCaptures.sourceUrl,
        pageTitle: researchCaptures.pageTitle,
        createdAt: researchCaptures.createdAt,
        extractedSales: researchCaptures.extractedSales,
      })
      .from(researchCaptures)
      .where(isNull(researchCaptures.importedIntoItemId))
      .orderBy(desc(researchCaptures.createdAt));

    return rows.map((row) => ({
      id: row.id,
      sourceUrl: row.sourceUrl,
      pageTitle: row.pageTitle,
      createdAt: row.createdAt.toISOString(),
      extractedCount: Array.isArray(row.extractedSales) ? row.extractedSales.length : 0,
    }));
  }

  async importCapture(captureId: string, itemId: string): Promise<ImportCaptureOutcome> {
    const database = getDatabase();

    const [item] = await database.select({ id: items.id }).from(items).where(eq(items.id, itemId));
    if (!item) return { ok: false, reason: 'Item not found' };

    const [capture] = await database
      .select({
        extractedSales: researchCaptures.extractedSales,
        importedIntoItemId: researchCaptures.importedIntoItemId,
      })
      .from(researchCaptures)
      .where(eq(researchCaptures.id, captureId));
    if (!capture) return { ok: false, reason: 'Capture not found' };
    if (capture.importedIntoItemId) {
      return { ok: false, reason: 'This capture was already imported' };
    }

    const sales = Array.isArray(capture.extractedSales)
      ? (capture.extractedSales as ComparableSale[])
      : [];
    if (sales.length === 0) {
      return { ok: false, reason: 'No comparable sales were extracted from this capture' };
    }

    let classifiedSales = sales;
    const matchProvider = getAnthropicComparableMatchProvider();
    const { runId } = await startMatchClassificationRun({
      itemId,
      provider: matchProvider.provider,
      model: matchProvider.model,
      listingCount: sales.length,
    });
    try {
      const identityFactRows = await database
        .select({ field: itemFacts.field, value: itemFacts.value })
        .from(itemFacts)
        .where(eq(itemFacts.itemId, itemId));
      const identity = buildIdentityFactsForMatching(identityFactRows);
      const classification = await classifyComparableSales(identity, sales, matchProvider);
      classifiedSales = classification.sales;
      await completeMatchClassificationRun({
        runId,
        outcome: 'succeeded',
        inputTokens: classification.usage?.inputTokens,
        outputTokens: classification.usage?.outputTokens,
        response: classification.response,
      });
    } catch (error) {
      // Classification is a best-effort pre-pass, never a blocker -- import
      // proceeds with everything included and unreasoned if it fails for
      // any reason (missing key, network error, bad response). Still logged
      // as a failed run so it shows in the Build log and isn't a silent gap.
      await completeMatchClassificationRun({
        runId,
        outcome: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error(
        'Comparable-sales match classification failed, importing without it',
        error instanceof Error ? error.name : 'UnknownError',
      );
    }

    await database.transaction(async (tx) => {
      await tx.insert(comparableSales).values(
        classifiedSales.map((sale) => ({
          id: randomUUID(),
          itemId,
          title: sale.title,
          match: sale.match,
          soldAt: sale.soldAt,
          price: sale.price,
          excluded: sale.excluded ?? false,
          excludedReason: sale.excludedReason ?? null,
          sourceCaptureId: captureId,
        })),
      );
      // The row (and its raw html) is kept, not deleted, so undoImport can
      // put it back in the pending inbox exactly as it was.
      await tx
        .update(researchCaptures)
        .set({ importedAt: new Date(), importedIntoItemId: itemId })
        .where(eq(researchCaptures.id, captureId));
      await logItemEvent(
        {
          itemId,
          kind: ITEM_EVENT_KIND.COMPARABLE_SALES_IMPORTED,
          sourceTable: 'research_captures',
          sourceId: captureId,
          summary: `Imported ${sales.length} comparable sale${sales.length === 1 ? '' : 's'} from a captured eBay page`,
          detail: { count: sales.length, source: 'manual_capture' },
        },
        tx,
      );
    });

    return { ok: true, imported: sales.length };
  }

  async undoImport(captureId: string, itemId: string): Promise<UndoImportOutcome> {
    const database = getDatabase();

    const [capture] = await database
      .select({ importedIntoItemId: researchCaptures.importedIntoItemId })
      .from(researchCaptures)
      .where(eq(researchCaptures.id, captureId));
    if (!capture) return { ok: false, reason: 'Capture not found' };
    if (capture.importedIntoItemId !== itemId) {
      return { ok: false, reason: 'This capture was not imported onto this item' };
    }

    await database.transaction(async (tx) => {
      await tx
        .delete(comparableSales)
        .where(
          and(eq(comparableSales.sourceCaptureId, captureId), eq(comparableSales.itemId, itemId)),
        );
      await tx
        .update(researchCaptures)
        .set({ importedAt: null, importedIntoItemId: null })
        .where(eq(researchCaptures.id, captureId));
      // Matches fact_corrections' own undo behaviour: an undone action drops
      // out of the Build log entirely rather than showing a stale "imported".
      await deleteItemEventBySource('research_captures', captureId, tx);
    });

    return { ok: true };
  }

  async deleteCapture(captureId: string): Promise<{ ok: boolean }> {
    const database = getDatabase();
    const result = await database
      .delete(researchCaptures)
      .where(eq(researchCaptures.id, captureId))
      .returning({ id: researchCaptures.id });
    return { ok: result.length > 0 };
  }
}
