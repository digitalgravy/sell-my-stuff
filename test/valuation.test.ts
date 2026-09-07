import assert from 'node:assert/strict';
import test from 'node:test';

import type { ComparableSale } from '../server/items/item-detail-repository';
import { computeValuation } from '../server/items/valuation';

const NOW = new Date('2026-09-07T00:00:00.000Z');

function sale(price: number, daysAgo: number, excluded = false): ComparableSale {
  const soldAt = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return { title: `Sale at £${price}`, match: 'Pre-owned', soldAt, price, excluded };
}

void test('computeValuation returns undefined when there are no included sales', () => {
  assert.equal(computeValuation([], NOW), undefined);
  assert.equal(computeValuation([sale(100, 10, true)], NOW), undefined);
});

void test('computeValuation ignores excluded sales entirely', () => {
  const withExcluded = computeValuation(
    [sale(100, 10), sale(105, 12), sale(110, 15), sale(9999, 1, true)],
    NOW,
  );
  assert.ok(withExcluded);
  assert.equal(withExcluded.evidenceCount, 3);
  assert.ok(withExcluded.buyItNowPrice < 200, 'the excluded £9999 sale must not skew the price');
});

void test('computeValuation produces a sane BIN/quick-sale/accept-offer ordering for a tight cluster', () => {
  const pricing = computeValuation(
    [sale(145, 5), sale(150, 10), sale(160, 15), sale(165, 20), sale(170, 25), sale(175, 30)],
    NOW,
  );
  assert.ok(pricing);
  assert.equal(pricing.evidenceCount, 6);
  assert.ok(pricing.quickSalePrice <= pricing.acceptOffersLow);
  assert.ok(pricing.acceptOffersLow <= pricing.acceptOffersHigh);
  assert.ok(pricing.acceptOffersHigh <= pricing.buyItNowPrice);
  // Psychological pricing: BIN always ends .99.
  assert.match(pricing.buyItNowPrice.toFixed(2), /\.99$/);
});

void test('computeValuation trims a wild outlier out of the range via IQR', () => {
  const pricing = computeValuation(
    [sale(100, 5), sale(102, 10), sale(98, 15), sale(101, 20), sale(5000, 25)],
    NOW,
  );
  assert.ok(pricing);
  assert.equal(pricing.evidenceCount, 4, 'the £5000 outlier should be trimmed out');
  assert.ok(pricing.likelyAchievedHigh < 200);
});

void test('computeValuation does not trim outliers when the sample is too small to judge', () => {
  const pricing = computeValuation([sale(100, 5), sale(500, 10), sale(105, 15)], NOW);
  assert.ok(pricing);
  assert.equal(pricing.evidenceCount, 3, 'fewer than 4 samples: nothing is trimmed');
});

void test('computeValuation prefers the recent window once there are enough recent sales', () => {
  const pricing = computeValuation(
    [
      sale(100, 10),
      sale(102, 20),
      sale(98, 30),
      sale(101, 40),
      sale(99, 50),
      // Old, much higher-priced sales outside the 90-day window.
      sale(500, 200),
      sale(520, 250),
    ],
    NOW,
  );
  assert.ok(pricing);
  assert.equal(pricing.evidenceWindowDays, 90);
  assert.equal(pricing.evidenceCount, 5);
  assert.ok(pricing.likelyAchievedHigh < 200, 'the old, expensive sales must be excluded by the recency window');
});

void test('computeValuation falls back to all evidence when too few recent sales exist', () => {
  const pricing = computeValuation([sale(100, 10), sale(500, 200), sale(520, 250)], NOW);
  assert.ok(pricing);
  assert.equal(pricing.evidenceWindowDays, undefined);
  assert.equal(pricing.evidenceCount, 3);
});

void test('computeValuation reports high confidence for a large, tightly-clustered sample', () => {
  const pricing = computeValuation(
    [
      sale(148, 5),
      sale(150, 8),
      sale(152, 12),
      sale(149, 15),
      sale(151, 18),
      sale(150, 22),
      sale(153, 25),
      sale(149, 28),
    ],
    NOW,
  );
  assert.ok(pricing);
  assert.equal(pricing.confidence, 'high');
});

void test('computeValuation reports low confidence for a single data point', () => {
  const pricing = computeValuation([sale(120, 5)], NOW);
  assert.ok(pricing);
  assert.equal(pricing.confidence, 'low');
  assert.equal(pricing.evidenceCount, 1);
});

void test('computeValuation downgrades confidence when the spread is very wide even with many samples', () => {
  const pricing = computeValuation(
    [sale(50, 5), sale(90, 8), sale(130, 12), sale(60, 15), sale(140, 18), sale(80, 22), sale(120, 25), sale(70, 28)],
    NOW,
  );
  assert.ok(pricing);
  assert.notEqual(pricing.confidence, 'high');
});
