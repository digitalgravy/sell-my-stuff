import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHomepageSnapshot,
  deriveActivityState,
  summarizeError,
} from '../server/items/homepage-snapshot';
import type { HomepageItemRow } from '../server/items/homepage-repository';

function row(overrides: Partial<HomepageItemRow>): HomepageItemRow {
  return {
    id: 'item-1',
    status: 'RESEARCHING',
    updatedAt: new Date('2026-09-04T10:00:00Z'),
    facts: { openQuestions: [] },
    hasEvidence: false,
    ...overrides,
  };
}

void test('routes an item with an open question into attention with that reason', () => {
  const snapshot = buildHomepageSnapshot([
    row({
      id: 'item-1',
      status: 'NEEDS_INFORMATION',
      facts: {
        manufacturer: 'NVIDIA',
        itemType: 'graphics card',
        openQuestions: ['Which memory capacity variant is this?'],
      },
    }),
  ]);

  assert.equal(snapshot.working.length, 0);
  assert.deepEqual(snapshot.attention, [
    {
      id: 'item-1',
      title: 'NVIDIA graphics card',
      reason: 'Which memory capacity variant is this?',
      updatedAt: '2026-09-04T10:00:00.000Z',
    },
  ]);
});

void test('falls back to a confidence reason when there is no open question text', () => {
  const snapshot = buildHomepageSnapshot([
    row({ status: 'NEEDS_INFORMATION', facts: { openQuestions: [] } }),
  ]);

  assert.equal(
    snapshot.attention[0]?.reason,
    'Confidence too low to proceed automatically',
  );
});

void test('routes non-NEEDS_INFORMATION statuses into working with a stage label', () => {
  const snapshot = buildHomepageSnapshot([
    row({ id: 'a', status: 'INBOX' }),
    row({ id: 'b', status: 'IDENTIFYING' }),
    row({ id: 'c', status: 'RESEARCHING', hasEvidence: true }),
  ]);

  assert.equal(snapshot.attention.length, 0);
  assert.deepEqual(
    snapshot.working.map((item) => item.stage),
    ['Queued for identification', 'Identifying', 'Researched — ready to list'],
  );
});

void test('routes a RESEARCHING item with a ready eBay search link into attention', () => {
  const snapshot = buildHomepageSnapshot([
    row({
      status: 'RESEARCHING',
      facts: {
        openQuestions: [],
        ebaySearchUrl: 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple+HomePod+mini',
      },
      hasEvidence: false,
    }),
  ]);

  assert.equal(snapshot.working.length, 0);
  assert.equal(snapshot.attention.length, 1);
  assert.equal(
    snapshot.attention[0]?.reason,
    'Comparable-sales research in progress',
  );
});

void test('routes a RESEARCHING item with no search link generated at all into attention', () => {
  // Real case: an item identified before research_comparable_sales existed.
  const snapshot = buildHomepageSnapshot([
    row({ status: 'RESEARCHING', facts: { openQuestions: [] }, hasEvidence: false }),
  ]);

  assert.equal(snapshot.working.length, 0);
  assert.equal(snapshot.attention.length, 1);
  assert.equal(snapshot.attention[0]?.reason, 'Comparable-sales research has not run yet');
});

void test('a RESEARCHING item with a search link but existing evidence stays in working, not attention', () => {
  const snapshot = buildHomepageSnapshot([
    row({
      status: 'RESEARCHING',
      facts: {
        openQuestions: [],
        ebaySearchUrl: 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple+HomePod+mini',
      },
      hasEvidence: true,
    }),
  ]);

  assert.equal(snapshot.attention.length, 0);
  assert.equal(snapshot.working.length, 1);
});

void test('deriveActivityState reflects real job state, not just lifecycle status', () => {
  assert.equal(deriveActivityState(row({ status: 'FAILED' })), 'errored');
  assert.equal(
    deriveActivityState(row({ status: 'IDENTIFYING', jobState: 'RUNNING' })),
    'working',
  );
  assert.equal(
    deriveActivityState(row({ status: 'IDENTIFYING', jobState: 'QUEUED' })),
    'waiting',
  );
  // RESEARCHING with no queued/running job -- no processor exists yet, so
  // this must read as stalled, not as quietly "in progress".
  assert.equal(
    deriveActivityState(row({ status: 'RESEARCHING', jobState: undefined })),
    'paused',
  );
  assert.equal(
    deriveActivityState(
      row({ status: 'IDENTIFYING', jobState: 'SUCCEEDED' }),
    ),
    'paused',
  );
});

void test('working items carry the derived activity state', () => {
  const snapshot = buildHomepageSnapshot([
    row({ id: 'a', status: 'IDENTIFYING', jobState: 'RUNNING' }),
    row({ id: 'b', status: 'IDENTIFYING', jobState: 'QUEUED' }),
    row({ id: 'c', status: 'RESEARCHING', jobState: undefined, hasEvidence: true }),
  ]);

  assert.deepEqual(
    snapshot.working.map((item) => item.activity),
    ['working', 'waiting', 'paused'],
  );
});

void test('falls back to the raw status as a stage label for an unmapped status', () => {
  const snapshot = buildHomepageSnapshot([row({ status: 'VALUING' })]);
  assert.equal(snapshot.working[0]?.stage, 'VALUING');
});

void test('routes a FAILED item into attention with a summarized error reason', () => {
  const snapshot = buildHomepageSnapshot([
    row({
      status: 'FAILED',
      facts: { itemType: 'graphics card', openQuestions: [] },
      lastError:
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
    }),
  ]);

  assert.equal(snapshot.working.length, 0);
  assert.equal(
    snapshot.attention[0]?.reason,
    'Identification failed: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
  );
  assert.equal(snapshot.attention[0]?.activity, 'errored');
});

void test('NEEDS_INFORMATION items carry no activity state — blocked on the user, not "paused"', () => {
  const snapshot = buildHomepageSnapshot([row({ status: 'NEEDS_INFORMATION' })]);
  assert.equal(snapshot.attention[0]?.activity, undefined);
});

void test('summarizeError extracts a provider API error message from JSON', () => {
  const reason = summarizeError(
    '400 {"type":"error","error":{"type":"invalid_request_error","message":"bad request"}}',
  );
  assert.equal(reason, 'Identification failed: bad request');
});

void test('summarizeError falls back to the raw text when it is not JSON', () => {
  assert.equal(
    summarizeError('socket hang up'),
    'Identification failed: socket hang up',
  );
});

void test('summarizeError falls back to a generic label when there is no error text', () => {
  assert.equal(summarizeError(undefined), 'Identification failed');
});

void test('summarizeError truncates a very long message', () => {
  const reason = summarizeError('x'.repeat(500));
  assert.ok(reason.length <= 160);
  assert.ok(reason.endsWith('…'));
});

void test('derives a display title from manufacturer, model and item type', () => {
  const withManufacturerAndModel = buildHomepageSnapshot([
    row({
      hasEvidence: true,
      facts: {
        manufacturer: 'Apple',
        model: 'Magic Keyboard',
        openQuestions: [],
      },
    }),
  ]);
  assert.equal(withManufacturerAndModel.working[0]?.title, 'Apple Magic Keyboard');

  const withManufacturerAndItemType = buildHomepageSnapshot([
    row({
      hasEvidence: true,
      facts: { manufacturer: 'NVIDIA', itemType: 'graphics card', openQuestions: [] },
    }),
  ]);
  assert.equal(
    withManufacturerAndItemType.working[0]?.title,
    'NVIDIA graphics card',
  );

  const withNoFacts = buildHomepageSnapshot([
    row({ hasEvidence: true, facts: { openQuestions: [] } }),
  ]);
  assert.equal(withNoFacts.working[0]?.title, 'Unidentified item');
});

void test('stats.ready counts only items with evidence and nothing outstanding', () => {
  const snapshot = buildHomepageSnapshot([
    row({ id: 'a', status: 'RESEARCHING', hasEvidence: true }),
    row({ id: 'b', status: 'RESEARCHING', hasEvidence: false }),
    row({ id: 'c', status: 'NEEDS_INFORMATION' }),
    row({ id: 'd', status: 'FAILED' }),
    row({ id: 'e', status: 'INBOX' }),
  ]);
  assert.equal(snapshot.stats.ready, 1);
  assert.equal(snapshot.stats.inProgress, 4);
});

void test('stats passes through outcome counts and totals from outside the active set unchanged', () => {
  const snapshot = buildHomepageSnapshot([], {
    live: 3,
    cleared: 7,
    realisedTotal: 120.5,
    estimatedValueTotal: 940,
  });
  assert.deepEqual(snapshot.stats, {
    ready: 0,
    inProgress: 0,
    live: 3,
    cleared: 7,
    realisedTotal: 120.5,
    estimatedValueTotal: 940,
  });
});

void test('stats defaults everything outside the active set to 0 when not supplied', () => {
  const snapshot = buildHomepageSnapshot([]);
  assert.deepEqual(snapshot.stats, {
    ready: 0,
    inProgress: 0,
    live: 0,
    cleared: 0,
    realisedTotal: 0,
    estimatedValueTotal: 0,
  });
});
