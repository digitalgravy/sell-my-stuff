import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEbayAspects,
  buildEbayListingUrl,
  mapConditionGradeToEbay,
} from '../server/marketplace/ebay-api-publisher';

void test('mapConditionGradeToEbay maps every CONDITION_GRADES value onto a real eBay ConditionEnum', () => {
  assert.equal(mapConditionGradeToEbay('new_sealed'), 'NEW');
  assert.equal(mapConditionGradeToEbay('unused_open_box'), 'NEW_OTHER');
  assert.equal(mapConditionGradeToEbay('excellent'), 'USED_EXCELLENT');
  assert.equal(mapConditionGradeToEbay('very_good'), 'USED_VERY_GOOD');
  assert.equal(mapConditionGradeToEbay('good'), 'USED_GOOD');
  assert.equal(mapConditionGradeToEbay('fair'), 'USED_ACCEPTABLE');
  assert.equal(mapConditionGradeToEbay('spares_repair'), 'FOR_PARTS_OR_NOT_WORKING');
});

void test('mapConditionGradeToEbay returns undefined for an unrecognised grade, never a guess', () => {
  assert.equal(mapConditionGradeToEbay('mint'), undefined);
});

void test('buildEbayAspects only includes item specifics actually known, never a fabricated one', () => {
  assert.deepEqual(buildEbayAspects({ brand: 'Sony', model: 'WH-1000XM4' }), {
    Brand: ['Sony'],
    Model: ['WH-1000XM4'],
  });
  assert.deepEqual(buildEbayAspects({}), {});
});

void test('buildEbayListingUrl points at the sandbox host in sandbox, production host in production', () => {
  assert.equal(buildEbayListingUrl('sandbox', '123456789012'), 'https://sandbox.ebay.co.uk/itm/123456789012');
  assert.equal(buildEbayListingUrl('production', '123456789012'), 'https://www.ebay.co.uk/itm/123456789012');
});
