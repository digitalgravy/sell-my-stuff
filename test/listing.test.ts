import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveListingChecks, deriveListingStrategyOptions } from '../server/items/listing';
import type { PricingAdvice } from '../server/items/item-detail-repository';

const PRICING: PricingAdvice = {
  likelyAchievedLow: 130,
  likelyAchievedHigh: 155,
  buyItNowPrice: 149,
  acceptOffersLow: 140,
  acceptOffersHigh: 141,
  quickSalePrice: 130,
  autoDeclineBelow: 117,
  confidence: 'high',
  evidenceCount: 8,
};

void test('deriveListingStrategyOptions returns undefined with no pricing yet', () => {
  assert.equal(deriveListingStrategyOptions({}), undefined);
});

void test('deriveListingStrategyOptions recommends Buy It Now when pricing confidence is not low', () => {
  const options = deriveListingStrategyOptions({ pricing: PRICING })!;
  const buyItNow = options.find((option) => option.name === 'Buy It Now')!;
  const auction = options.find((option) => option.name === '7-day auction')!;
  assert.equal(buyItNow.recommended, true);
  assert.equal(auction.recommended, false);
  assert.equal(buyItNow.value, '£149.00');
});

void test('deriveListingStrategyOptions recommends the auction instead when pricing confidence is low', () => {
  const options = deriveListingStrategyOptions({ pricing: { ...PRICING, confidence: 'low' } })!;
  assert.equal(options.find((option) => option.name === 'Buy It Now')!.recommended, false);
  assert.equal(options.find((option) => option.name === '7-day auction')!.recommended, true);
});

void test('deriveListingChecks requires a title within 80 characters', () => {
  const checks = deriveListingChecks({
    title: undefined,
    photoCount: 4,
    conditionDescriptionConfirmed: true,
    hasWeightEstimate: true,
  });
  assert.equal(checks.find((check) => check.label.includes('80 characters'))?.state, 'required');

  const withLongTitle = deriveListingChecks({
    title: 'x'.repeat(81),
    photoCount: 4,
    conditionDescriptionConfirmed: true,
    hasWeightEstimate: true,
  });
  assert.equal(withLongTitle.find((check) => check.label.includes('80 characters'))?.state, 'required');

  const withGoodTitle = deriveListingChecks({
    title: 'A perfectly fine title',
    photoCount: 4,
    conditionDescriptionConfirmed: true,
    hasWeightEstimate: true,
  });
  assert.equal(withGoodTitle.find((check) => check.label.includes('80 characters'))?.state, 'yes');
});

void test('deriveListingChecks requires at least 4 photos', () => {
  const checks = deriveListingChecks({
    title: 'Title',
    photoCount: 2,
    conditionDescriptionConfirmed: true,
    hasWeightEstimate: true,
  });
  assert.equal(checks.find((check) => check.label.includes('photos'))?.state, 'required');
});

void test('deriveListingChecks marks the condition description check required until the owner confirms it', () => {
  const unconfirmed = deriveListingChecks({
    title: 'Title',
    photoCount: 4,
    conditionDescriptionConfirmed: false,
    hasWeightEstimate: true,
  });
  assert.equal(
    unconfirmed.find((check) => check.label.includes('Condition description'))?.state,
    'required',
  );

  const confirmed = deriveListingChecks({
    title: 'Title',
    photoCount: 4,
    conditionDescriptionConfirmed: true,
    hasWeightEstimate: true,
  });
  assert.equal(
    confirmed.find((check) => check.label.includes('Condition description'))?.state,
    'yes',
  );
});

void test('deriveListingChecks treats the weight/dimensions check as optional, never required', () => {
  const checks = deriveListingChecks({
    title: 'Title',
    photoCount: 4,
    conditionDescriptionConfirmed: true,
    hasWeightEstimate: false,
  });
  assert.equal(checks.find((check) => check.label.includes('weight'))?.state, 'optional');
});
