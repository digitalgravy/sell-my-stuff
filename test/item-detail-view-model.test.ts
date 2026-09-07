import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStepsFromConditionRuns,
  buildStepsFromCorrections,
  buildStepsFromImports,
  buildStepsFromResearchJobs,
  buildStepsFromRuns,
  deriveAttention,
  derivePhases,
} from '../server/items/item-detail-view-model';

void test('derivePhases marks Identified done only when identity facts actually exist', () => {
  assert.equal(
    derivePhases({ status: 'INBOX', hasIdentityFacts: false, hasConditionFacts: false, hasEvidence: false }).find(
      (p) => p.key === 'identified',
    )?.state,
    'not_started',
  );
  assert.equal(
    derivePhases({ status: 'IDENTIFYING', hasIdentityFacts: false, hasConditionFacts: false, hasEvidence: false }).find(
      (p) => p.key === 'identified',
    )?.state,
    'pending',
  );
  assert.equal(
    derivePhases({ status: 'RESEARCHING', hasIdentityFacts: true, hasConditionFacts: false, hasEvidence: false }).find(
      (p) => p.key === 'identified',
    )?.state,
    'done',
  );
});

void test('derivePhases never marks a genuinely unbuilt phase as done or pending', () => {
  const phases = derivePhases({ status: 'RESEARCHING', hasIdentityFacts: true, hasConditionFacts: false, hasEvidence: false });
  const unbuilt = phases.filter((p) => p.key !== 'identified' && p.key !== 'researched');
  assert.ok(unbuilt.every((p) => p.state === 'not_started'));
  assert.equal(unbuilt.length, 2);
});

void test('derivePhases marks Researched pending while status is RESEARCHING with no evidence yet, done once evidence exists', () => {
  assert.equal(
    derivePhases({ status: 'RESEARCHING', hasIdentityFacts: true, hasConditionFacts: false, hasEvidence: false }).find(
      (p) => p.key === 'researched',
    )?.state,
    'pending',
  );
  assert.equal(
    derivePhases({ status: 'RESEARCHING', hasIdentityFacts: true, hasConditionFacts: false, hasEvidence: true }).find(
      (p) => p.key === 'researched',
    )?.state,
    'done',
  );
  assert.equal(
    derivePhases({ status: 'IDENTIFYING', hasIdentityFacts: false, hasConditionFacts: false, hasEvidence: false }).find(
      (p) => p.key === 'researched',
    )?.state,
    'not_started',
  );
});

void test('derivePhases marks Assessed done only when condition facts actually exist', () => {
  assert.equal(
    derivePhases({ status: 'IDENTIFYING', hasIdentityFacts: false, hasConditionFacts: false, hasEvidence: false }).find(
      (p) => p.key === 'assessed',
    )?.state,
    'pending',
  );
  assert.equal(
    derivePhases({ status: 'RESEARCHING', hasIdentityFacts: true, hasConditionFacts: true, hasEvidence: false }).find(
      (p) => p.key === 'assessed',
    )?.state,
    'done',
  );
  assert.equal(
    derivePhases({ status: 'RESEARCHING', hasIdentityFacts: true, hasConditionFacts: false, hasEvidence: false }).find(
      (p) => p.key === 'assessed',
    )?.state,
    'not_started',
  );
});

void test('buildStepsFromConditionRuns maps a successful run to its own llm step, separate from identification', () => {
  const steps = buildStepsFromConditionRuns(
    [
      {
        id: 'condition-run-1',
        attempt: 1,
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        outcome: 'succeeded',
        inputTokens: 90,
        outputTokens: 15,
        response: { overallGrade: { grade: 'good' } },
        startedAt: '2026-09-07T00:00:00.000Z',
        completedAt: '2026-09-07T00:00:04.000Z',
      },
    ],
    3,
  );

  assert.equal(steps.length, 1);
  assert.equal(steps[0]?.stage, 'Assess condition');
  assert.equal(steps[0]?.outcome, 'succeeded');
  assert.equal(steps[0]?.durationMs, 4000);
  assert.match(steps[0]?.blocks[0]?.content ?? '', /assessing the cosmetic and functional condition/);
  assert.equal(steps[0]?.blocks[1]?.meta, '3 photos');
});

void test('buildStepsFromConditionRuns maps a failed run to an error block', () => {
  const steps = buildStepsFromConditionRuns(
    [
      {
        id: 'condition-run-2',
        attempt: 1,
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        outcome: 'failed',
        errorMessage: 'condition provider timed out',
        startedAt: '2026-09-07T00:00:00.000Z',
        completedAt: '2026-09-07T00:00:02.000Z',
      },
    ],
    1,
  );

  assert.equal(steps[0]?.outcome, 'failed');
  assert.equal(steps[0]?.blocks.at(-1)?.label, 'Error');
  assert.equal(steps[0]?.blocks.at(-1)?.content, 'condition provider timed out');
});

void test('deriveAttention returns one required task per open question', () => {
  const tasks = deriveAttention({
    status: 'NEEDS_INFORMATION',
    openQuestions: ['Which storage variant?', 'Original box included?'],
    hasEvidence: false,
  });
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((t) => t.required));
  assert.equal(tasks[0]?.title, 'Which storage variant?');
});

void test('deriveAttention falls back to a confidence task when there is no open question text', () => {
  const tasks = deriveAttention({
    status: 'NEEDS_INFORMATION',
    openQuestions: [],
    hasEvidence: false,
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.id, 'low-confidence');
});

void test('deriveAttention returns one required task for a FAILED item', () => {
  const tasks = deriveAttention({
    status: 'FAILED',
    openQuestions: [],
    lastError: '400 {"error":{"message":"credit balance too low"}}',
    hasEvidence: false,
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.ctaLabel, 'Retry');
  assert.match(tasks[0]?.note ?? '', /credit balance too low/);
});

void test('deriveAttention returns nothing for a status with no attention needed', () => {
  assert.deepEqual(
    deriveAttention({ status: 'IDENTIFYING', openQuestions: [], hasEvidence: false }),
    [],
  );
});

void test('deriveAttention offers to prepare an eBay search when RESEARCHING but no link has ever been generated', () => {
  // Real case: an item identified before the research_comparable_sales job
  // type existed sits at RESEARCHING forever with no ebaySearchUrl fact --
  // must not silently show "nothing needs attention".
  const tasks = deriveAttention({ status: 'RESEARCHING', openQuestions: [], hasEvidence: false });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.ctaLabel, 'Prepare eBay search');
  assert.equal(tasks[0]?.href, undefined);
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

void test('deriveAttention offers a Search eBay task once a search link exists and there is no evidence yet', () => {
  const tasks = deriveAttention({
    status: 'RESEARCHING',
    openQuestions: [],
    hasEvidence: false,
    ebaySearchUrl: 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple+HomePod+mini',
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.ctaLabel, 'Search eBay');
  assert.equal(tasks[0]?.href, 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple+HomePod+mini');
});

void test('deriveAttention stops offering the Search eBay task once evidence has been imported', () => {
  const tasks = deriveAttention({
    status: 'RESEARCHING',
    openQuestions: [],
    hasEvidence: true,
    ebaySearchUrl: 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple+HomePod+mini',
  });
  assert.deepEqual(tasks, []);
});

void test('buildStepsFromImports produces an undo endpoint targeting the capture import route', () => {
  const steps = buildStepsFromImports([
    {
      captureId: 'capture-1',
      sourceUrl: 'https://www.ebay.co.uk/sch/i.html?_nkw=HomePod+mini',
      pageTitle: 'HomePod mini for sale',
      importedCount: 12,
      importedAt: '2026-09-06T00:00:00.000Z',
    },
  ]);
  assert.equal(steps[0]?.undo?.endpoint, 'research/captures/capture-1/import');
  assert.match(steps[0]?.detail ?? '', /Imported 12 comparable sales/);
});

void test('buildStepsFromResearchJobs only reports terminal attempts, with the search link on success', () => {
  const steps = buildStepsFromResearchJobs([
    { id: 'job-1', state: 'SUCCEEDED', lastError: null, searchUrl: 'https://www.ebay.co.uk/sch' },
    { id: 'job-2', state: 'QUEUED', lastError: null },
    { id: 'job-3', state: 'FAILED', lastError: 'boom' },
  ]);
  assert.equal(steps.length, 2);
  assert.equal(steps[0]?.outcome, 'succeeded');
  assert.equal(steps[0]?.blocks[0]?.content, 'https://www.ebay.co.uk/sch');
  assert.equal(steps[1]?.outcome, 'failed');
  assert.equal(steps[1]?.blocks[0]?.content, 'boom');
});

void test('buildStepsFromCorrections shows the previous and new value and an undo endpoint', () => {
  const steps = buildStepsFromCorrections([
    {
      id: 'correction-1',
      field: 'identity.manufacturer',
      previousValue: '"Aple"',
      newValue: '"Apple"',
      correctedAt: '2026-09-06T00:00:00.000Z',
    },
  ]);
  assert.equal(steps[0]?.undo?.endpoint, 'facts/correct/correction-1');
  assert.equal(steps[0]?.blocks[0]?.content, '"Aple" → "Apple"');
});
