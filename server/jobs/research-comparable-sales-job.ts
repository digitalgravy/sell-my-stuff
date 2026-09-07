import type { ResearchJobRepository } from '@/server/items/research-repository';

export const RESEARCH_COMPARABLE_SALES_JOB_TYPE = 'research_comparable_sales';

export interface ResearchComparableSalesJobDependencies {
  jobs: ResearchJobRepository;
  maxAttempts?: number;
  leaseMs?: number;
}

export type ResearchComparableSalesJobResult =
  | { claimed: false }
  | { claimed: true; itemId: string; outcome: 'succeeded' | 'failed' };

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LEASE_MS = 15 * 60 * 1000;

/**
 * There is no automated eBay search today -- eBay blocks Playwright-driven
 * browsers even under human-paced input (see docs/research), so the only
 * viable path is a human using their own real browser. This job does the
 * one part that IS safe to automate: turning already-identified facts into
 * a direct, pre-filtered Sold+Completed search link, saved as a fact so the
 * homepage can surface "go capture this on eBay" as a concrete next action
 * instead of the item silently sitting at RESEARCHING.
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
    const url = buildEbaySearchUrl(facts);
    await dependencies.jobs.saveIdentificationFacts(job.itemId, [
      {
        field: 'research.ebay_search_url',
        value: JSON.stringify(url),
        confidence: 1,
        origin: 'web_research',
      },
    ]);
    await dependencies.jobs.completeJob(job.id, 100);
    return { claimed: true, itemId: job.itemId, outcome: 'succeeded' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const outcome = job.attempt >= maxAttempts ? 'FAILED' : 'RETRY';
    await dependencies.jobs.failJob(job.id, message, outcome);
    return { claimed: true, itemId: job.itemId, outcome: 'failed' };
  }
}

function readFact(facts: { field: string; value: string }[], field: string): string | undefined {
  const row = facts.find((fact) => fact.field === field);
  if (!row) return undefined;
  try {
    const parsed: unknown = JSON.parse(row.value);
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function buildEbaySearchUrl(facts: { field: string; value: string }[]): string {
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
  const query = terms.length > 0 ? terms.join(' ') : (itemType ?? 'item');

  const params = new URLSearchParams({
    _nkw: query,
    _sacat: '0',
    LH_Sold: '1',
    LH_Complete: '1',
  });
  return `https://www.ebay.co.uk/sch/i.html?${params.toString()}`;
}
