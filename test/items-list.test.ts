import assert from 'node:assert/strict';
import test from 'node:test';

import { estimateMarketplaceFeeGbp } from '../server/items/fees';
import { buildItemListEntry, deriveItemTitle } from '../server/items/items-list';
import type { AttentionTask, ItemDetail, ItemDetailFact } from '../server/items/item-detail-repository';

function fact(field: string, value: unknown): ItemDetailFact {
  return { field, value, confidence: 0.9, origin: 'image_inference', retrievedAt: '2026-09-07T00:00:00.000Z' };
}

function detail(overrides: Partial<ItemDetail>): ItemDetail {
  return {
    id: 'item-1',
    status: 'RESEARCHING',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    photos: [],
    facts: [],
    phases: [],
    attention: [],
    aiCostUsd: 0,
    buildSteps: [],
    ...overrides,
  };
}

void test('deriveItemTitle prefers manufacturer + model', () => {
  assert.equal(
    deriveItemTitle([fact('identity.manufacturer', 'Apple'), fact('identity.model', 'HomePod mini')]),
    'Apple HomePod mini',
  );
});

void test('deriveItemTitle falls back to manufacturer + item type when there is no model', () => {
  assert.equal(
    deriveItemTitle([fact('identity.manufacturer', 'NVIDIA'), fact('identity.item_type', 'graphics card')]),
    'NVIDIA graphics card',
  );
});

void test('deriveItemTitle falls back to "Unidentified item" with no usable facts', () => {
  assert.equal(deriveItemTitle([]), 'Unidentified item');
});

void test('buildItemListEntry: LIVE status always gets the at_auction pill, no fabricated detail', () => {
  const entry = buildItemListEntry(detail({ status: 'LIVE' }));
  assert.equal(entry.pill, 'at_auction');
  assert.equal(entry.detail, undefined);
});

void test('buildItemListEntry: SOLD/COMPLETE gets the complete pill', () => {
  assert.equal(buildItemListEntry(detail({ status: 'SOLD' })).pill, 'complete');
  assert.equal(buildItemListEntry(detail({ status: 'COMPLETE' })).pill, 'complete');
});

void test('buildItemListEntry: a required attention task always wins, even with pricing already present', () => {
  const requiredTask: AttentionTask = {
    id: 'x',
    title: 'Confirm the listing text',
    note: '',
    impact: '',
    ctaLabel: 'Correct',
    required: true,
  };
  const entry = buildItemListEntry(
    detail({
      status: 'NEEDS_INFORMATION',
      attention: [requiredTask],
      pricing: {
        likelyAchievedLow: 10,
        likelyAchievedHigh: 20,
        buyItNowPrice: 21.99,
        acceptOffersLow: 15,
        acceptOffersHigh: 20,
        quickSalePrice: 10,
        autoDeclineBelow: 9,
        confidence: 'high',
        evidenceCount: 5,
      },
    }),
  );
  assert.equal(entry.pill, 'needs_action');
  // Deliberately no detail text here -- an attention task's title can be a
  // full question/sentence, which doesn't belong wrapped under a pill in
  // a fixed-width table column (the item's own page explains why).
  assert.equal(entry.detail, undefined);
});

void test('buildItemListEntry: pricing with nothing required is ready', () => {
  const entry = buildItemListEntry(
    detail({
      status: 'RESEARCHING',
      pricing: {
        likelyAchievedLow: 10,
        likelyAchievedHigh: 20,
        buyItNowPrice: 21.99,
        acceptOffersLow: 15,
        acceptOffersHigh: 20,
        quickSalePrice: 10,
        autoDeclineBelow: 9,
        confidence: 'high',
        evidenceCount: 5,
      },
    }),
  );
  assert.equal(entry.pill, 'ready');
  assert.equal(entry.estimatedProfit, 21.99 - estimateMarketplaceFeeGbp(21.99));
});

void test('buildItemListEntry: estimatedProfit nets out AI research cost', () => {
  const entry = buildItemListEntry(
    detail({
      status: 'RESEARCHING',
      aiCostUsd: 1,
      pricing: {
        likelyAchievedLow: 10,
        likelyAchievedHigh: 20,
        buyItNowPrice: 21.99,
        acceptOffersLow: 15,
        acceptOffersHigh: 20,
        quickSalePrice: 10,
        autoDeclineBelow: 9,
        confidence: 'high',
        evidenceCount: 5,
      },
    }),
  );
  assert.equal(entry.estimatedProfit, 21.99 - 0.79 - estimateMarketplaceFeeGbp(21.99));
});

void test('buildItemListEntry: no pricing and nothing required falls back to a stage label', () => {
  const entry = buildItemListEntry(detail({ status: 'IDENTIFYING' }));
  assert.equal(entry.pill, 'in_progress');
  assert.equal(entry.detail, 'Identifying');
});

void test('buildItemListEntry: uses the position-0 photo as the hero image', () => {
  const entry = buildItemListEntry(
    detail({
      photos: [
        { id: 'p1', url: '/api/items/item-1/photos/p1', label: 'Photo 1', position: 0 },
        { id: 'p2', url: '/api/items/item-1/photos/p2', label: 'Photo 2', position: 1 },
      ],
    }),
  );
  assert.equal(entry.heroPhotoUrl, '/api/items/item-1/photos/p1');
});
