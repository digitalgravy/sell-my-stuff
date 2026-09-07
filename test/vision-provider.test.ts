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
    canSearchEbayConfidently: true,
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
    canSearchEbayConfidently: false,
    searchReadinessNote: 'No manufacturer or model visible in any photo.',
  });
  assert.deepEqual(parsed.openQuestions, []);
});

void test('requires canSearchEbayConfidently -- a generic-but-confident identification still needs it reasoned about explicitly', () => {
  assert.throws(() =>
    identificationResultSchema.parse({
      candidates: [
        { itemType: 'wireless keyboard', confidence: 0.9, evidence: 'label visible' },
      ],
    }),
  );
});

void test('searchReadinessNote is optional -- only needed when canSearchEbayConfidently is false', () => {
  const parsed = identificationResultSchema.parse({
    candidates: [
      { itemType: 'wireless keyboard', manufacturer: 'Apple', model: 'Magic Keyboard', confidence: 0.95, evidence: 'label' },
    ],
    canSearchEbayConfidently: true,
  });
  assert.equal(parsed.searchReadinessNote, undefined);
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
