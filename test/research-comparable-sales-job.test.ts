import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEbaySearchUrl,
  runResearchComparableSalesJob,
} from '../server/jobs/research-comparable-sales-job';
import type {
  ClaimedJob,
  IdentificationFactInput,
  ResearchJobRepository,
} from '../server/items/research-repository';

class MemoryJobRepository implements ResearchJobRepository {
  queue: ClaimedJob[] = [];
  identityFactsByItem = new Map<string, { field: string; value: string }[]>();
  savedFacts: IdentificationFactInput[] = [];
  completed: { jobId: string; progress: number }[] = [];
  failed: { jobId: string; error: string }[] = [];
  enqueued: { itemId: string; type: string; idempotencyKey: string }[] = [];

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
