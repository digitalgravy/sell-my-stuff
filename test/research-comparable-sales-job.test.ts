import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEbaySearchUrl,
  runResearchComparableSalesJob,
} from '../server/jobs/research-comparable-sales-job';
import type {
  ClaimedJob,
  ComparableSaleInput,
  IdentificationFactInput,
  MatchClassificationRunCompleteInput,
  MatchClassificationRunStartInput,
  ResearchJobRepository,
} from '../server/items/research-repository';
import type {
  ComparableMatchProvider,
  IdentityFactsForMatching,
  CandidateListing,
  MatchClassificationOutcome,
} from '../server/ai/comparable-match-provider';
import type {
  ComparableSalesBrowserProvider,
  ComparableSalesBrowserResult,
} from '../server/research/comparable-sales-browser-provider';

class MemoryJobRepository implements ResearchJobRepository {
  queue: ClaimedJob[] = [];
  identityFactsByItem = new Map<string, { field: string; value: string }[]>();
  savedFacts: IdentificationFactInput[] = [];
  savedComparableSales: ComparableSaleInput[] = [];
  matchRunLogs: (MatchClassificationRunStartInput & MatchClassificationRunCompleteInput)[] = [];
  completed: { jobId: string; progress: number }[] = [];
  failed: { jobId: string; error: string }[] = [];
  enqueued: { itemId: string; type: string; idempotencyKey: string }[] = [];
  private pendingMatchRuns = new Map<string, MatchClassificationRunStartInput>();
  private nextMatchRunId = 1;

  async claimNextJob(type: string, maxAttempts: number) {
    const index = this.queue.findIndex(
      (job) => job.type === type && job.attempt < maxAttempts,
    );
    if (index === -1) return null;
    const job = this.queue[index]!;
    job.attempt += 1;
    return { ...job };
  }

  async getItemPhotos() {
    return [];
  }

  async saveIdentificationFacts(_itemId: string, facts: IdentificationFactInput[]) {
    this.savedFacts.push(...facts);
  }

  async startIdentificationRun() {
    return { runId: 'run-unused' };
  }

  async completeIdentificationRun() {}

  async markPhotosInspected() {}

  async transitionItemStatus() {}

  async completeJob(jobId: string, progress: number) {
    this.completed.push({ jobId, progress });
  }

  async failJob(jobId: string, error: string) {
    this.failed.push({ jobId, error });
  }

  async getIdentityFacts(itemId: string) {
    return this.identityFactsByItem.get(itemId) ?? [];
  }

  async enqueueJob(input: { itemId: string; type: string; idempotencyKey: string }) {
    this.enqueued.push(input);
  }

  async saveComparableSales(_itemId: string, sales: ComparableSaleInput[]) {
    this.savedComparableSales.push(...sales);
  }

  async startMatchClassificationRun(entry: MatchClassificationRunStartInput) {
    const runId = `match-run-${this.nextMatchRunId++}`;
    this.pendingMatchRuns.set(runId, entry);
    return { runId };
  }

  async completeMatchClassificationRun(entry: MatchClassificationRunCompleteInput) {
    const start = this.pendingMatchRuns.get(entry.runId);
    this.pendingMatchRuns.delete(entry.runId);
    this.matchRunLogs.push({ ...(start as MatchClassificationRunStartInput), ...entry });
  }
}

class StubBrowserProvider implements ComparableSalesBrowserProvider {
  received: string[] = [];
  constructor(private readonly result: ComparableSalesBrowserResult) {}

  async fetchSoldListings(keywords: string) {
    this.received.push(keywords);
    return this.result;
  }
}

class StubMatchProvider implements ComparableMatchProvider {
  readonly provider = 'stub';
  readonly model = 'stub-model';
  constructor(private readonly outcome: MatchClassificationOutcome) {}

  async classify(_identity: IdentityFactsForMatching, _listings: CandidateListing[]) {
    return this.outcome;
  }
}

function fact(field: string, value: string): { field: string; value: string } {
  return { field, value: JSON.stringify(value) };
}

void test('buildEbaySearchUrl combines manufacturer, family and model into the search term', () => {
  const url = buildEbaySearchUrl([
    fact('identity.manufacturer', 'Apple'),
    fact('identity.family', 'HomePod'),
    fact('identity.model', 'mini'),
  ]);
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://www.ebay.co.uk/sch/i.html');
  assert.equal(parsed.searchParams.get('_nkw'), 'Apple HomePod mini');
  assert.equal(parsed.searchParams.get('LH_Sold'), '1');
  assert.equal(parsed.searchParams.get('LH_Complete'), '1');
});

void test('buildEbaySearchUrl drops duplicate terms', () => {
  const url = buildEbaySearchUrl([
    fact('identity.manufacturer', 'Apple'),
    fact('identity.family', 'Apple'),
    fact('identity.model', 'HomePod mini'),
  ]);
  assert.equal(new URL(url).searchParams.get('_nkw'), 'Apple HomePod mini');
});

void test('buildEbaySearchUrl drops a family term wholly contained in the model term', () => {
  // Real case that motivated this: family "HomePod", model "HomePod mini"
  // used to produce "Apple HomePod HomePod mini".
  const url = buildEbaySearchUrl([
    fact('identity.manufacturer', 'Apple'),
    fact('identity.family', 'HomePod'),
    fact('identity.model', 'HomePod mini'),
  ]);
  assert.equal(new URL(url).searchParams.get('_nkw'), 'Apple HomePod mini');
});

void test('buildEbaySearchUrl falls back to item type when nothing more specific is known', () => {
  const url = buildEbaySearchUrl([fact('identity.item_type', 'wireless speaker')]);
  assert.equal(new URL(url).searchParams.get('_nkw'), 'wireless speaker');
});

void test('buildEbaySearchUrl falls back to "item" when there are no usable facts at all', () => {
  const url = buildEbaySearchUrl([]);
  assert.equal(new URL(url).searchParams.get('_nkw'), 'item');
});

void test('runResearchComparableSalesJob saves a search-url fact and completes the job', async () => {
  const jobs = new MemoryJobRepository();
  jobs.queue.push({ id: 'job-1', itemId: 'item-1', type: 'research_comparable_sales', attempt: 0 });
  jobs.identityFactsByItem.set('item-1', [
    fact('identity.manufacturer', 'Apple'),
    fact('identity.model', 'HomePod mini'),
  ]);

  const result = await runResearchComparableSalesJob({ jobs });

  assert.deepEqual(result, { claimed: true, itemId: 'item-1', outcome: 'succeeded' });
  assert.equal(jobs.completed.length, 1);
  const urlFact = jobs.savedFacts.find((f) => f.field === 'research.ebay_search_url');
  assert.ok(urlFact);
  assert.equal(urlFact?.origin, 'web_research');
  assert.match(JSON.parse(urlFact!.value), /^https:\/\/www\.ebay\.co\.uk\/sch\/i\.html\?/);
});

void test('runResearchComparableSalesJob returns claimed:false when nothing is queued', async () => {
  const jobs = new MemoryJobRepository();
  const result = await runResearchComparableSalesJob({ jobs });
  assert.deepEqual(result, { claimed: false });
});

void test('runResearchComparableSalesJob imports sales the browser provider finds, classified before saving', async () => {
  const jobs = new MemoryJobRepository();
  jobs.queue.push({ id: 'job-2', itemId: 'item-2', type: 'research_comparable_sales', attempt: 0 });
  jobs.identityFactsByItem.set('item-2', [fact('identity.manufacturer', 'Apple')]);
  const browserProvider = new StubBrowserProvider({
    outcome: 'succeeded',
    query: 'Apple',
    url: 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple',
    sales: [
      { title: 'Apple Widget', match: 'Pre-owned', soldAt: '2026-09-01', price: 50 },
      { title: 'Apple Widget bundle with case', match: 'Pre-owned', soldAt: '2026-09-02', price: 60 },
    ],
  });
  const matchProvider = new StubMatchProvider({
    result: {
      listings: [
        { index: 0, isMatch: true, reason: 'Same item' },
        { index: 1, isMatch: false, reason: 'Bundle with accessories' },
      ],
    },
    usage: { inputTokens: 20, outputTokens: 10 },
  });

  const result = await runResearchComparableSalesJob({ jobs, browserProvider, matchProvider });

  assert.deepEqual(result, { claimed: true, itemId: 'item-2', outcome: 'succeeded' });
  assert.equal(browserProvider.received[0], 'Apple');
  assert.equal(jobs.savedComparableSales.length, 2);
  assert.equal(jobs.savedComparableSales[0]?.excluded, undefined);
  assert.equal(jobs.savedComparableSales[1]?.excluded, true);
  assert.equal(jobs.savedComparableSales[1]?.excludedReason, 'Bundle with accessories');
  assert.equal(jobs.matchRunLogs.length, 1);
  assert.equal(jobs.matchRunLogs[0]?.outcome, 'succeeded');
  assert.equal(jobs.matchRunLogs[0]?.listingCount, 2);
  // Still saves the search-link fact even after a successful auto-import.
  const urlFact = jobs.savedFacts.find((f) => f.field === 'research.ebay_search_url');
  assert.ok(urlFact);
});

void test('runResearchComparableSalesJob saves auto-researched sales unclassified when no match provider is given', async () => {
  const jobs = new MemoryJobRepository();
  jobs.queue.push({ id: 'job-3', itemId: 'item-3', type: 'research_comparable_sales', attempt: 0 });
  const browserProvider = new StubBrowserProvider({
    outcome: 'succeeded',
    query: 'item',
    url: 'https://www.ebay.co.uk/sch/i.html?_nkw=item',
    sales: [{ title: 'Widget', match: 'New', soldAt: '2026-09-01', price: 20 }],
  });

  await runResearchComparableSalesJob({ jobs, browserProvider });

  assert.equal(jobs.savedComparableSales.length, 1);
  assert.equal(jobs.matchRunLogs.length, 0);
});

void test('runResearchComparableSalesJob falls back to the search-link fact when the browser provider is unavailable', async () => {
  const jobs = new MemoryJobRepository();
  jobs.queue.push({ id: 'job-4', itemId: 'item-4', type: 'research_comparable_sales', attempt: 0 });
  const browserProvider = new StubBrowserProvider({
    outcome: 'unavailable',
    reason: 'Browser session is WAITING_FOR_HUMAN, not available for automated research',
  });

  const result = await runResearchComparableSalesJob({ jobs, browserProvider });

  assert.deepEqual(result, { claimed: true, itemId: 'item-4', outcome: 'succeeded' });
  assert.equal(jobs.savedComparableSales.length, 0);
  const urlFact = jobs.savedFacts.find((f) => f.field === 'research.ebay_search_url');
  assert.ok(urlFact);
});
