import assert from 'node:assert/strict';
import test from 'node:test';

import { computeProceedsBreakdown, estimateMarketplaceFeeGbp } from '../server/items/fees';

void test('estimateMarketplaceFeeGbp applies the approximate flat rate, rounded to pence', () => {
  assert.equal(estimateMarketplaceFeeGbp(100), 12);
  assert.equal(estimateMarketplaceFeeGbp(33.33), 4);
});

void test('computeProceedsBreakdown nets the marketplace fee and AI cost off the sale price', () => {
  const breakdown = computeProceedsBreakdown(100, 0.5);
  assert.equal(breakdown.saleProceeds, 100);
  assert.equal(breakdown.marketplaceFeeGbp, 12);
  assert.equal(breakdown.aiResearchCostGbp, 0.5);
  assert.equal(breakdown.estimatedNet, 87.5);
});

void test('computeProceedsBreakdown can go negative for a low-value item with real costs', () => {
  const breakdown = computeProceedsBreakdown(2, 1);
  assert.ok(breakdown.estimatedNet < 2);
});
