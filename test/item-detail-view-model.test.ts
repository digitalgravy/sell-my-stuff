import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStepsFromRuns,
  deriveAttention,
  derivePhases,
} from '../server/items/item-detail-view-model';

void test('derivePhases marks Identified done only when identity facts actually exist', () => {
  assert.equal(
    derivePhases({ status: 'INBOX', hasIdentityFacts: false }).find(
      (p) => p.key === 'identified',
    )?.state,
    'not_started',
  );
  assert.equal(
    derivePhases({ status: 'IDENTIFYING', hasIdentityFacts: false }).find(
      (p) => p.key === 'identified',
    )?.state,
    'pending',
  );
  assert.equal(
    derivePhases({ status: 'RESEARCHING', hasIdentityFacts: true }).find(
      (p) => p.key === 'identified',
    )?.state,
    'done',
  );
});

void test('derivePhases never marks an unbuilt phase as done or pending', () => {
  const phases = derivePhases({ status: 'RESEARCHING', hasIdentityFacts: true });
  const unbuilt = phases.filter((p) => p.key !== 'identified');
  assert.ok(unbuilt.every((p) => p.state === 'not_started'));
  assert.equal(unbuilt.length, 3);
});

void test('deriveAttention returns one required task per open question', () => {
  const tasks = deriveAttention({
    status: 'NEEDS_INFORMATION',
    openQuestions: ['Which storage variant?', 'Original box included?'],
  });
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((t) => t.required));
  assert.equal(tasks[0]?.title, 'Which storage variant?');
});

void test('deriveAttention falls back to a confidence task when there is no open question text', () => {
  const tasks = deriveAttention({ status: 'NEEDS_INFORMATION', openQuestions: [] });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.id, 'low-confidence');
});

void test('deriveAttention returns one required task for a FAILED item', () => {
  const tasks = deriveAttention({
    status: 'FAILED',
    openQuestions: [],
    lastError: '400 {"error":{"message":"credit balance too low"}}',
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.ctaLabel, 'Retry');
  assert.match(tasks[0]?.note ?? '', /credit balance too low/);
});

void test('deriveAttention returns nothing for a status with no attention needed', () => {
  assert.deepEqual(
    deriveAttention({ status: 'RESEARCHING', openQuestions: [] }),
    [],
  );
});

void test('buildStepsFromRuns maps a successful run to one llm step with the real system prompt', () => {
  const steps = buildStepsFromRuns(
    [
      {
        id: 'run-1',
        attempt: 1,
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        outcome: 'succeeded',
        inputTokens: 100,
        outputTokens: 20,
        response: { candidates: [{ itemType: 'speaker' }], openQuestions: [] },
        startedAt: '2026-09-04T00:00:00.000Z',
        completedAt: '2026-09-04T00:00:05.000Z',
      },
    ],
    4,
  );

  assert.equal(steps.length, 1);
  assert.equal(steps[0]?.type, 'llm');
  assert.equal(steps[0]?.outcome, 'succeeded');
  assert.equal(steps[0]?.durationMs, 5000);
  assert.equal(steps[0]?.detail, 'Vision model turn · attempt 1 · 1 candidate');
  assert.equal(steps[0]?.blocks[0]?.label, 'System prompt');
  assert.match(steps[0]?.blocks[0]?.content ?? '', /product-identification assistant/);
  assert.equal(steps[0]?.blocks[1]?.meta, '4 photos');
  assert.equal(steps[0]?.blocks[2]?.label, 'Assistant response');
});

void test('buildStepsFromRuns maps a failed run to an error block, no assistant response', () => {
  const steps = buildStepsFromRuns(
    [
      {
        id: 'run-2',
        attempt: 2,
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        outcome: 'failed',
        errorMessage: 'vision provider timed out',
        startedAt: '2026-09-04T00:00:00.000Z',
        completedAt: '2026-09-04T00:00:02.000Z',
      },
    ],
    1,
  );

  assert.equal(steps[0]?.outcome, 'failed');
  assert.equal(steps[0]?.blocks.at(-1)?.label, 'Error');
  assert.equal(steps[0]?.blocks.at(-1)?.content, 'vision provider timed out');
});
