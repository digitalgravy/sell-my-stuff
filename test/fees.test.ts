import assert from 'node:assert/strict';
import test from 'node:test';

import { computeProceedsBreakdown, estimateMarketplaceFeeGbp } from '../server/items/fees';

void test('estimateMarketplaceFeeGbp is zero -- eBay UK private sellers have paid no selling fee since Oct 2024', () => {
  assert.equal(estimateMarketplaceFeeGbp(100), 0);
  assert.equal(estimateMarketplaceFeeGbp(33.33), 0);
});

void test('computeProceedsBreakdown nets only the AI cost off the sale price, with no marketplace fee', () => {
  const breakdown = computeProceedsBreakdown(100, 0.5);
  assert.equal(breakdown.saleProceeds, 100);
  assert.equal(breakdown.marketplaceFeeGbp, 0);
  assert.equal(breakdown.aiResearchCostGbp, 0.5);
  assert.equal(breakdown.estimatedNet, 99.5);
});

void test('computeProceedsBreakdown can go negative for a low-value item with real AI costs', () => {
  const breakdown = computeProceedsBreakdown(2, 3);
  assert.ok(breakdown.estimatedNet < 0);
});
