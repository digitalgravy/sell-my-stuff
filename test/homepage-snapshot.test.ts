import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHomepageSnapshot } from '../server/items/homepage-snapshot';
import type { HomepageItemRow } from '../server/items/homepage-repository';

function row(overrides: Partial<HomepageItemRow>): HomepageItemRow {
  return {
    id: 'item-1',
    status: 'RESEARCHING',
    updatedAt: new Date('2026-09-04T10:00:00Z'),
    facts: { openQuestions: [] },
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
    row({ id: 'c', status: 'RESEARCHING' }),
  ]);

  assert.equal(snapshot.attention.length, 0);
  assert.deepEqual(
    snapshot.working.map((item) => item.stage),
    [
      'Queued for identification',
      'Identifying',
      'Researching recent sales',
    ],
  );
});

void test('falls back to the raw status as a stage label for an unmapped status', () => {
  const snapshot = buildHomepageSnapshot([row({ status: 'VALUING' })]);
  assert.equal(snapshot.working[0]?.stage, 'VALUING');
});

void test('derives a display title from manufacturer, model and item type', () => {
  const withManufacturerAndModel = buildHomepageSnapshot([
    row({
      facts: {
        manufacturer: 'Apple',
        model: 'Magic Keyboard',
        openQuestions: [],
      },
    }),
  ]);
  assert.equal(withManufacturerAndModel.working[0]?.title, 'Apple Magic Keyboard');

  const withManufacturerAndItemType = buildHomepageSnapshot([
    row({ facts: { manufacturer: 'NVIDIA', itemType: 'graphics card', openQuestions: [] } }),
  ]);
  assert.equal(
    withManufacturerAndItemType.working[0]?.title,
    'NVIDIA graphics card',
  );

  const withNoFacts = buildHomepageSnapshot([row({ facts: { openQuestions: [] } })]);
  assert.equal(withNoFacts.working[0]?.title, 'Unidentified item');
});
