import { buildIdentityFactsForMatching, classifyComparableSales } from '@/server/items/comparable-match';
import type {
  ComparableSaleInput,
  ResearchJobRepository,
} from '@/server/items/research-repository';
import type { ComparableMatchProvider } from '@/server/ai/comparable-match-provider';
import type { ComparableSalesBrowserProvider } from '@/server/research/comparable-sales-browser-provider';

export const RESEARCH_COMPARABLE_SALES_JOB_TYPE = 'research_comparable_sales';

export interface ResearchComparableSalesJobDependencies {
  jobs: ResearchJobRepository;
  /**
   * Tried in order, cheapest/most-likely-to-work first (the real Mac
   * browser operator, then the Docker/Xvfb one) -- the first provider
   * to actually complete a search (even with zero results: that's a
   * real answer, not a failure) stops the cascade. A provider returning
   * `unavailable` (unconfigured, busy, blocked) falls through to the
   * next one. Empty/undefined falls straight to the manual search-link
   * path (tier 3).
   */
  browserProviders?: ComparableSalesBrowserProvider[];
  /** Undefined skips classification -- auto-imported sales are saved unclassified rather than lost. */
  matchProvider?: ComparableMatchProvider;
  maxAttempts?: number;
  leaseMs?: number;
}

export type ResearchComparableSalesJobResult =
  | { claimed: false }
  | { claimed: true; itemId: string; outcome: 'succeeded' | 'failed' };

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LEASE_MS = 15 * 60 * 1000;

/**
 * Cascade for turning identified facts into comparable-sales evidence,
 * cheapest/most-likely-to-work first:
 *
 * 1. sell-browser-mac: the real, already-logged-in Chrome on an always-on
 *    Mac, driven via a real Playwright CDP connection at human pace (real
 *    mouse travel, real per-character typing, real pauses -- see that
 *    project's human-interaction.mjs). Built after sell-browser (below)
 *    started getting flagged by eBay even under human-paced input --
 *    a real machine with a real browser and a real trusted-device
 *    identity turned out to get through where a Docker/Xvfb Chromium
 *    didn't.
 * 2. sell-browser (a separate Overseer project -- see its README): the
 *    same human-paced approach, but Docker/Xvfb Chromium rather than a
 *    real machine. Kept as a fallback in case the Mac is asleep, logged
 *    out, or unreachable.
 *
 * Both are tried in order via browserProviders and silently skipped (not
 * an error) if unconfigured, busy, or blocked -- eBay bot-blocking, a
 * session mid-human-takeover, or the service being down are all real,
 * expected outcomes here, not failures of this job.
 *
 * 3. (Future) an interactive agent session the user is actually present
 *    for -- not built; the user would need to be the one triggering it,
 *    which doesn't fit a background job.
 * 4. A direct, pre-filtered Sold+Completed search link, saved as a fact so
 *    the homepage can surface "go capture this on eBay" as a concrete next
 *    action -- the only tier that was ever built until now, and still the
 *    fallback of last resort.
 *
 * Sales pulled in automatically (tiers 1-2) go through the same match
 * classifier as a manual capture import before being trusted as evidence
 * (see server/items/comparable-match.ts) -- an LLM judging fitness, never
 * treated as ground truth without that pass.
 */
export async function runResearchComparableSalesJob(
  dependencies: ResearchComparableSalesJobDependencies,
): Promise<ResearchComparableSalesJobResult> {
  const maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const leaseMs = dependencies.leaseMs ?? DEFAULT_LEASE_MS;
  const job = await dependencies.jobs.claimNextJob(
    RESEARCH_COMPARABLE_SALES_JOB_TYPE,
    maxAttempts,
    leaseMs,
  );
  if (!job) return { claimed: false };

  try {
    const facts = await dependencies.jobs.getIdentityFacts(job.itemId);
    const keywords = buildSearchKeywords(facts);

    for (const provider of dependencies.browserProviders ?? []) {
      const result = await provider.fetchSoldListings(keywords);
      if (result.outcome === 'succeeded') {
        if (result.sales.length > 0) {
          console.log(
            `research_comparable_sales: browser research found ${result.sales.length} sale(s) for item ${job.itemId}`,
          );
          await importAutoResearchedSales(dependencies, job.itemId, facts, result.sales);
        } else {
          console.log(
            `research_comparable_sales: browser research for item ${job.itemId} found no sales -- falling back to the manual search link`,
          );
        }
        // A real answer (even an empty one) from a working browser --
        // stop the cascade rather than asking a second provider the
        // identical question against the same live eBay.
        break;
      }
      console.log(
        `research_comparable_sales: browser research unavailable for item ${job.itemId} (${result.reason}) -- trying the next tier`,
      );
    }

    const url = buildEbaySearchUrlFromKeywords(keywords);
    await dependencies.jobs.saveIdentificationFacts(job.itemId, [
      {
        field: 'research.ebay_search_url',
        value: JSON.stringify(url),
        confidence: 1,
        origin: 'web_research',
      },
    ]);
    // Real content for what used to be an opaque "COMPUTE · succeeded" Build
    // log entry -- the search link actually built, captured at the moment
    // it was built (not re-derived from whatever the current fact value
    // happens to be, which could have moved on after a later regenerate).
    await dependencies.jobs.logItemEvent({
      itemId: job.itemId,
      kind: 'ebay_search_prepared',
      summary: 'Prepared an eBay search link',
      detail: { url },
    });
    await dependencies.jobs.completeJob(job.id, 100);
    return { claimed: true, itemId: job.itemId, outcome: 'succeeded' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const outcome = job.attempt >= maxAttempts ? 'FAILED' : 'RETRY';
    await dependencies.jobs.failJob(job.id, message, outcome);
    await dependencies.jobs.logItemEvent({
      itemId: job.itemId,
      kind: 'research_failed',
      summary: 'Comparable-sales research failed',
      detail: { error: message },
    });
    return { claimed: true, itemId: job.itemId, outcome: 'failed' };
  }
}

async function importAutoResearchedSales(
  dependencies: ResearchComparableSalesJobDependencies,
  itemId: string,
  facts: { field: string; value: string }[],
  sales: ComparableSaleInput[],
): Promise<void> {
  let classified = sales;
  if (dependencies.matchProvider) {
    const matchProvider = dependencies.matchProvider;
    const identity = buildIdentityFactsForMatching(facts);
    const { runId } = await dependencies.jobs.startMatchClassificationRun({
      itemId,
      provider: matchProvider.provider,
      model: matchProvider.model,
      listingCount: sales.length,
    });
    try {
      const classification = await classifyComparableSales(identity, sales, matchProvider);
      classified = classification.sales;
      await dependencies.jobs.completeMatchClassificationRun({
        runId,
        outcome: 'succeeded',
        inputTokens: classification.usage?.inputTokens,
        outputTokens: classification.usage?.outputTokens,
        response: classification.response,
      });
    } catch (error) {
      // Classification is a best-effort pre-pass, never a blocker -- import
      // proceeds with everything included and unreasoned if it fails, same
      // as a manual capture import's fallback.
      await dependencies.jobs.completeMatchClassificationRun({
        runId,
        outcome: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  await dependencies.jobs.saveComparableSales(itemId, classified);
}

function readFact(facts: { field: string; value: string }[], field: string): string | undefined {
  const row = facts.find((fact) => fact.field === field)?.value;
  if (!row) return undefined;
  try {
    const parsed: unknown = JSON.parse(row);
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The plain-text search terms shared by both the automated browser search
 * (tier 1) and the manual search-link fallback (tier 3) -- one term-
 * building policy, not two that could quietly drift apart.
 */
export function buildSearchKeywords(facts: { field: string; value: string }[]): string {
  const manufacturer = readFact(facts, 'identity.manufacturer');
  const family = readFact(facts, 'identity.family');
  const model = readFact(facts, 'identity.model');
  const itemType = readFact(facts, 'identity.item_type');

  // Family and model routinely overlap textually (family "HomePod", model
  // "HomePod mini") -- a plain dedupe only catches exact repeats, leaving
  // "Apple HomePod HomePod mini". Drop any term wholly contained in
  // another rather than just exact duplicates.
  const terms: string[] = [];
  for (const term of [manufacturer, family, model]) {
    if (!term) continue;
    const lower = term.toLowerCase();
    if (terms.some((existing) => existing.toLowerCase().includes(lower))) continue;
    for (let i = terms.length - 1; i >= 0; i--) {
      if (lower.includes(terms[i]!.toLowerCase())) terms.splice(i, 1);
    }
    terms.push(term);
  }
  return terms.length > 0 ? terms.join(' ') : (itemType ?? 'item');
}

function buildEbaySearchUrlFromKeywords(keywords: string): string {
  const params = new URLSearchParams({
    _nkw: keywords,
    _sacat: '0',
    LH_Sold: '1',
    LH_Complete: '1',
  });
  return `https://www.ebay.co.uk/sch/i.html?${params.toString()}`;
}

export function buildEbaySearchUrl(facts: { field: string; value: string }[]): string {
  return buildEbaySearchUrlFromKeywords(buildSearchKeywords(facts));
}
