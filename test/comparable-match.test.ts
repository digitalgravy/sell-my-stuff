import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIdentityFactsForMatching,
  classifyComparableSales,
} from '../server/items/comparable-match';
import type {
  CandidateListing,
  ComparableMatchProvider,
  IdentityFactsForMatching,
  MatchClassificationOutcome,
} from '../server/ai/comparable-match-provider';
import type { ComparableSale } from '../server/items/item-detail-repository';

function sale(title: string, price = 50): ComparableSale {
  return { title, match: 'Pre-owned', soldAt: '2026-09-01', price };
}

class StubMatchProvider implements ComparableMatchProvider {
  readonly provider = 'stub';
  readonly model = 'stub-model';
  received?: { identity: IdentityFactsForMatching; listings: CandidateListing[] };

  constructor(private readonly outcome: MatchClassificationOutcome) {}

  async classify(identity: IdentityFactsForMatching, listings: CandidateListing[]) {
    this.received = { identity, listings };
    return this.outcome;
  }
}

void test('classifyComparableSales excludes only the listings the provider marks as non-matches', async () => {
  const provider = new StubMatchProvider({
    result: {
      listings: [
        { index: 0, isMatch: true, reason: 'Same model' },
        { index: 1, isMatch: false, reason: 'Bundle with accessories' },
        { index: 2, isMatch: true, reason: 'Same model' },
      ],
    },
    usage: { inputTokens: 100, outputTokens: 50 },
  });

  const sales = [sale('Widget A2374'), sale('Widget A2374 bundle with case'), sale('Widget A2374 white')];
  const { sales: result, usage } = await classifyComparableSales({}, sales, provider);

  assert.equal(result[0]?.excluded, undefined);
  assert.equal(result[1]?.excluded, true);
  assert.equal(result[1]?.excludedReason, 'Bundle with accessories');
  assert.equal(result[2]?.excluded, undefined);
  assert.deepEqual(usage, { inputTokens: 100, outputTokens: 50 });
});

void test('classifyComparableSales sends title and condition, not price or date, to the provider', async () => {
  const provider = new StubMatchProvider({
    result: { listings: [] },
    usage: { inputTokens: 10, outputTokens: 5 },
  });
  await classifyComparableSales({ manufacturer: 'Apple' }, [sale('Widget', 99.99)], provider);

  assert.deepEqual(provider.received?.identity, { manufacturer: 'Apple' });
  assert.deepEqual(provider.received?.listings, [{ title: 'Widget', match: 'Pre-owned' }]);
});

void test('classifyComparableSales leaves a listing untouched when the provider has no verdict for it', async () => {
  const provider = new StubMatchProvider({
    result: { listings: [] },
    usage: { inputTokens: 10, outputTokens: 5 },
  });
  const { sales: result } = await classifyComparableSales({}, [sale('Widget')], provider);
  assert.equal(result[0]?.excluded, undefined);
});

void test('classifyComparableSales returns an empty array without calling the provider', async () => {
  const provider = new StubMatchProvider({
    result: { listings: [] },
    usage: { inputTokens: 0, outputTokens: 0 },
  });
  const result = await classifyComparableSales({}, [], provider);
  assert.deepEqual(result.sales, []);
  assert.equal(result.usage, undefined);
  assert.equal(provider.received, undefined);
});

function fact(field: string, value: unknown): { field: string; value: string } {
  return { field, value: JSON.stringify(value) };
}

void test('buildIdentityFactsForMatching reads only the identity fields relevant to matching', () => {
  const identity = buildIdentityFactsForMatching([
    fact('identity.manufacturer', 'Apple'),
    fact('identity.model', 'HomePod mini'),
    fact('identity.model_numbers', ['A2374']),
    fact('identity.open_questions', ['irrelevant here']),
  ]);
  assert.deepEqual(identity, {
    itemType: undefined,
    manufacturer: 'Apple',
    family: undefined,
    model: 'HomePod mini',
    modelNumbers: ['A2374'],
    colour: undefined,
    conditionGrade: undefined,
  });
});

void test('buildIdentityFactsForMatching returns all-undefined for no facts', () => {
  const identity = buildIdentityFactsForMatching([]);
  assert.deepEqual(identity, {
    itemType: undefined,
    manufacturer: undefined,
    family: undefined,
    model: undefined,
    modelNumbers: undefined,
    colour: undefined,
    conditionGrade: undefined,
  });
});

void test('buildIdentityFactsForMatching also reads the condition grade, for condition-aware matching', () => {
  const identity = buildIdentityFactsForMatching([
    fact('identity.manufacturer', 'Apple'),
    fact('condition.overall_grade', 'very_good'),
  ]);
  assert.equal(identity.conditionGrade, 'very_good');
});
