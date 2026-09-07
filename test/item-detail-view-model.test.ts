import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStepFromSimpleEvent,
  buildStepsFromAnswerResolutionRuns,
  buildStepsFromConditionRuns,
  buildStepsFromCorrections,
  buildStepsFromImports,
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
  assert.deepEqual(
    unbuilt.map((p) => p.key),
    ['assessed', 'draft_ready', 'auction', 'delivered', 'funds_received'],
  );
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

void test('derivePhases says "checking sold listings" instead of "ready to search eBay" while a match run is in flight', () => {
  // Real case caught live: automated research had already found 60 sold
  // listings and a match-classification call was pending -- "Ready to
  // search eBay" wrongly implied the user still needed to do something.
  const checking = derivePhases({
    status: 'RESEARCHING',
    hasIdentityFacts: true,
    hasConditionFacts: true,
    hasEvidence: false,
    isCheckingEvidence: true,
  }).find((p) => p.key === 'researched');
  assert.equal(checking?.state, 'pending');
  assert.equal(checking?.detail, 'Checking sold listings against your item');

  const notChecking = derivePhases({
    status: 'RESEARCHING',
    hasIdentityFacts: true,
    hasConditionFacts: true,
    hasEvidence: false,
    isCheckingEvidence: false,
  }).find((p) => p.key === 'researched');
  assert.equal(notChecking?.detail, 'Ready to search eBay');
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
        sequence: 1,
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
        sequence: 2,
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

void test('deriveAttention surfaces a condition open question as non-blocking even while research proceeds', () => {
  // The whole point of not gating research on condition confidence: the
  // "Search eBay" task and the condition question coexist, one required,
  // one not.
  const tasks = deriveAttention({
    status: 'RESEARCHING',
    openQuestions: [],
    conditionOpenQuestions: ['Does the power adapter and box come with it?'],
    hasEvidence: false,
    ebaySearchUrl: 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple+HomePod+mini',
  });
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.ctaLabel, 'Search eBay');
  assert.equal(tasks[0]?.required, true);
  assert.equal(tasks[1]?.title, 'Does the power adapter and box come with it?');
  assert.equal(tasks[1]?.required, false);
});

void test('deriveAttention still surfaces a condition open question once research has already completed', () => {
  const tasks = deriveAttention({
    status: 'RESEARCHING',
    openQuestions: [],
    conditionOpenQuestions: ['Does the power adapter and box come with it?'],
    hasEvidence: true,
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.required, false);
});

void test('deriveAttention returns nothing for condition when there are no condition open questions', () => {
  assert.deepEqual(
    deriveAttention({ status: 'IDENTIFYING', openQuestions: [], conditionOpenQuestions: [], hasEvidence: false }),
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
        sequence: 1,
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
        sequence: 2,
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
      id: 'event-1',
      sequence: 1,
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

void test('buildStepsFromImports omits the undo control for an automated import with no capture to reopen', () => {
  const steps = buildStepsFromImports([
    {
      id: 'event-2',
      sequence: 2,
      sourceUrl: null,
      pageTitle: null,
      importedCount: 4,
      importedAt: '2026-09-06T00:00:00.000Z',
    },
  ]);
  assert.equal(steps[0]?.undo, undefined);
  assert.match(steps[0]?.detail ?? '', /automated eBay research/);
});

void test('buildStepsFromCorrections shows the previous and new value and an undo endpoint targeting the correction id', () => {
  const steps = buildStepsFromCorrections([
    {
      id: 'event-3',
      sequence: 3,
      correctionId: 'correction-1',
      field: 'identity.manufacturer',
      previousValue: '"Aple"',
      newValue: '"Apple"',
      correctedAt: '2026-09-06T00:00:00.000Z',
    },
  ]);
  assert.equal(steps[0]?.id, 'event-3');
  assert.equal(steps[0]?.undo?.endpoint, 'facts/correct/correction-1');
  assert.equal(steps[0]?.blocks[0]?.content, '"Aple" → "Apple"');
});

void test('buildStepFromSimpleEvent renders a prepared eBay search link', () => {
  const step = buildStepFromSimpleEvent({
    id: 'event-4',
    sequence: 4,
    kind: 'ebay_search_prepared',
    summary: 'Prepared an eBay search link',
    detail: { url: 'https://www.ebay.co.uk/sch/i.html?_nkw=HomePod+mini' },
  });
  assert.equal(step.stage, 'Prepare eBay search');
  assert.equal(step.outcome, 'succeeded');
  assert.equal(step.blocks[0]?.content, 'https://www.ebay.co.uk/sch/i.html?_nkw=HomePod+mini');
});

void test('buildStepFromSimpleEvent renders a failed research attempt', () => {
  const step = buildStepFromSimpleEvent({
    id: 'event-5',
    sequence: 5,
    kind: 'research_failed',
    summary: 'Comparable-sales research failed',
    detail: { error: 'boom' },
  });
  assert.equal(step.outcome, 'failed');
  assert.equal(step.blocks[0]?.label, 'Error');
  assert.equal(step.blocks[0]?.content, 'boom');
});

void test('buildStepFromSimpleEvent renders a manual retry with no detail needed', () => {
  const step = buildStepFromSimpleEvent({
    id: 'event-6',
    sequence: 6,
    kind: 'identification_retried',
    summary: 'Manually retried identification',
    detail: null,
  });
  assert.equal(step.stage, 'Retry identification');
  assert.equal(step.type, 'tool');
  assert.equal(step.outcome, 'succeeded');
});

void test('buildStepsFromAnswerResolutionRuns shows one block per changed fact under a single step', () => {
  const steps = buildStepsFromAnswerResolutionRuns([
    {
      id: 'event-7',
      sequence: 7,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      answerCount: 2,
      outcome: 'succeeded',
      inputTokens: 200,
      outputTokens: 40,
      startedAt: '2026-09-07T00:00:00.000Z',
      completedAt: '2026-09-07T00:00:03.000Z',
      changes: [
        {
          field: 'condition.missing_parts',
          previousValue: '"Power cable appears attached but no adapter"',
          newValue: '"Original adapter and box both included"',
          previousConfidence: 0.4,
          confidence: 0.97,
        },
        {
          field: 'condition.functional_status',
          previousValue: '"Appears functional"',
          newValue: '"Confirmed working, tested by owner"',
          previousConfidence: 0.6,
          confidence: 0.95,
        },
      ],
    },
  ]);

  assert.equal(steps.length, 1);
  assert.equal(steps[0]?.stage, 'Resolve answers');
  assert.equal(steps[0]?.outcome, 'succeeded');
  assert.equal(steps[0]?.durationMs, 3000);
  assert.equal(steps[0]?.blocks.length, 4); // system prompt + assistant response + 2 changes
  assert.equal(steps[0]?.blocks[2]?.label, 'condition.missing_parts');
  assert.match(steps[0]?.blocks[2]?.content ?? '', /Power cable appears attached.*→.*Original adapter and box/);
  assert.equal(steps[0]?.blocks[3]?.label, 'condition.functional_status');
});

void test('buildStepsFromAnswerResolutionRuns shows a pending state before the response resolves', () => {
  const steps = buildStepsFromAnswerResolutionRuns([
    {
      id: 'event-8',
      sequence: 8,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      answerCount: 3,
      startedAt: '2026-09-07T00:00:00.000Z',
    },
  ]);
  assert.equal(steps[0]?.outcome, 'pending');
  assert.match(steps[0]?.detail, /submitted, waiting for a response/);
});
