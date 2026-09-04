import assert from 'node:assert/strict';
import test from 'node:test';

import { identificationResultSchema } from '../server/ai/vision-provider';

void test('accepts a well-formed identification result', () => {
  const parsed = identificationResultSchema.parse({
    candidates: [
      {
        itemType: 'wireless keyboard',
        manufacturer: 'Apple',
        confidence: 0.9,
        evidence: 'Apple logo visible on the top case',
      },
    ],
    openQuestions: [],
  });
  assert.equal(parsed.candidates.length, 1);
});

void test('defaults openQuestions to an empty array when omitted', () => {
  const parsed = identificationResultSchema.parse({
    candidates: [
      {
        itemType: 'graphics card',
        confidence: 0.5,
        evidence: 'Fan shroud shape',
      },
    ],
  });
  assert.deepEqual(parsed.openQuestions, []);
});

void test('rejects a candidate missing required evidence', () => {
  assert.throws(() =>
    identificationResultSchema.parse({
      candidates: [{ itemType: 'keyboard', confidence: 0.9 }],
    }),
  );
});

void test('rejects an out-of-range confidence value', () => {
  assert.throws(() =>
    identificationResultSchema.parse({
      candidates: [
        { itemType: 'keyboard', confidence: 1.4, evidence: 'label' },
      ],
    }),
  );
});

void test('rejects a result with no candidates', () => {
  assert.throws(() => identificationResultSchema.parse({ candidates: [] }));
});
