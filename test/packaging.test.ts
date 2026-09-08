import assert from 'node:assert/strict';
import test from 'node:test';

import { derivePackagingRecommendation, matchInventoryStock } from '../server/items/packaging';

void test('derivePackagingRecommendation returns undefined with no fragility grade at all', () => {
  assert.equal(derivePackagingRecommendation({}), undefined);
});

void test('derivePackagingRecommendation picks the smallest box tier the item fits in', () => {
  const recommendation = derivePackagingRecommendation({
    lengthCm: 20,
    widthCm: 18,
    heightCm: 8,
    fragility: 'moderate',
  });
  assert.equal(recommendation?.boxSizeTier, 'Small box (up to 25×18×10cm)');
});

void test('derivePackagingRecommendation falls back to the unknown tier when a dimension is missing', () => {
  const recommendation = derivePackagingRecommendation({ lengthCm: 20, fragility: 'robust' });
  assert.equal(recommendation?.boxSizeTier, 'Unknown -- dimensions incomplete, check manually');
});

void test('derivePackagingRecommendation reports oversized for anything bigger than the largest tier', () => {
  const recommendation = derivePackagingRecommendation({
    lengthCm: 80,
    widthCm: 60,
    heightCm: 40,
    fragility: 'robust',
  });
  assert.equal(recommendation?.boxSizeTier, 'Oversized (over 45×35×20cm) -- check manually');
});

void test('derivePackagingRecommendation adds no bubble wrap for a robust item with no special handling', () => {
  const recommendation = derivePackagingRecommendation({ fragility: 'robust' });
  const materialNames = recommendation!.materials.map((material) => material.material);
  assert.ok(!materialNames.includes('Bubble wrap (layers)'));
  assert.deepEqual(materialNames, ['Cardboard box', 'Parcel tape', 'Packing paper / void fill']);
});

void test('derivePackagingRecommendation adds reinforced corners only for very_fragile', () => {
  const veryFragile = derivePackagingRecommendation({ fragility: 'very_fragile' });
  assert.ok(veryFragile!.materials.some((material) => material.material === 'Reinforced corner protectors'));

  const fragile = derivePackagingRecommendation({ fragility: 'fragile' });
  assert.ok(!fragile!.materials.some((material) => material.material === 'Reinforced corner protectors'));
});

void test('derivePackagingRecommendation adds one material set per special-handling flag', () => {
  const recommendation = derivePackagingRecommendation({
    fragility: 'robust',
    specialHandling: ['anti_static', 'liquid'],
  });
  const materialNames = recommendation!.materials.map((material) => material.material);
  assert.ok(materialNames.includes('Anti-static bag'));
  assert.ok(materialNames.includes('Resealable bag'));
  assert.ok(materialNames.includes('Absorbent padding'));
});

void test('derivePackagingRecommendation merges a repeated special-handling flag into one quantity', () => {
  const recommendation = derivePackagingRecommendation({
    fragility: 'robust',
    specialHandling: ['anti_static', 'anti_static'],
  });
  const antiStaticEntries = recommendation!.materials.filter(
    (material) => material.material === 'Anti-static bag',
  );
  assert.equal(antiStaticEntries.length, 1);
  assert.equal(antiStaticEntries[0]!.quantity, 2);
});

void test('matchInventoryStock reports not_tracked for a material with no matching inventory row', () => {
  const [result] = matchInventoryStock([{ material: 'Cardboard box', quantity: 1 }], []);
  assert.equal(result?.status, 'not_tracked');
  assert.equal(result?.quantityOnHand, undefined);
});

void test('matchInventoryStock matches by name case-insensitively and reports in_stock above threshold', () => {
  const [result] = matchInventoryStock(
    [{ material: 'cardboard box', quantity: 1 }],
    [{ name: 'Cardboard Box', quantityOnHand: 10, lowStockThreshold: 2 }],
  );
  assert.equal(result?.status, 'in_stock');
  assert.equal(result?.quantityOnHand, 10);
});

void test('matchInventoryStock reports low_stock at or below the threshold', () => {
  const [result] = matchInventoryStock(
    [{ material: 'Bubble wrap (layers)', quantity: 1 }],
    [{ name: 'Bubble wrap (layers)', quantityOnHand: 2, lowStockThreshold: 2 }],
  );
  assert.equal(result?.status, 'low_stock');
});
