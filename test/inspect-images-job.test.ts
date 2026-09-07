import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ConditionAssessmentProvider,
  ConditionAssessmentResult,
} from '../server/ai/condition-provider';
import type {
  ConvertedPhoto,
  PhotoConverter,
  PhotoForConversion,
} from '../server/ai/photo-conversion';
import type {
  IdentificationResult,
  PhotoForIdentification,
  VisionIdentificationProvider,
} from '../server/ai/vision-provider';
import {
  BASE_RETRY_DELAY_MS,
  DEFAULT_MAX_ATTEMPTS,
  retryDelayMs,
  runInspectImagesJob,
} from '../server/jobs/inspect-images-job';
import type {
  ClaimedJob,
  ConditionAssessmentRunCompleteInput,
  ConditionAssessmentRunStartInput,
  IdentificationFactInput,
  IdentificationRunCompleteInput,
  IdentificationRunStartInput,
  ItemPhotoForResearch,
  ItemStatusValue,
  ResearchJobRepository,
} from '../server/items/research-repository';
import type { ObjectStore } from '../server/storage/object-store';

class MemoryResearchJobRepository implements ResearchJobRepository {
  queue: ClaimedJob[] = [];
  photosByItem = new Map<string, ItemPhotoForResearch[]>();
  savedFacts: IdentificationFactInput[] = [];
  inspectedPhotoIds: string[] = [];
  statusHistory: ItemStatusValue[] = [];
  completed: { jobId: string; progress: number }[] = [];
  failed: {
    jobId: string;
    error: string;
    outcome: 'RETRY' | 'FAILED';
    retryAt?: Date;
  }[] = [];
  runLogs: (IdentificationRunStartInput & IdentificationRunCompleteInput)[] = [];
  conditionRunLogs: (ConditionAssessmentRunStartInput & ConditionAssessmentRunCompleteInput)[] = [];
  enqueued: { itemId: string; type: string; idempotencyKey: string }[] = [];
  identityFacts: { field: string; value: string }[] = [];
  private pendingRuns = new Map<string, IdentificationRunStartInput>();
  private pendingConditionRuns = new Map<string, ConditionAssessmentRunStartInput>();
  private nextRunId = 1;
  private nextConditionRunId = 1;

  async claimNextJob(type: string, maxAttempts: number, _leaseMs: number) {
    const index = this.queue.findIndex(
      (job) => job.type === type && job.attempt < maxAttempts,
    );
    if (index === -1) return null;
    const job = this.queue[index]!;
    job.attempt += 1;
    return { ...job };
  }

  async getItemPhotos(itemId: string) {
    return this.photosByItem.get(itemId) ?? [];
  }

  async saveIdentificationFacts(
    _itemId: string,
    facts: IdentificationFactInput[],
  ) {
    this.savedFacts.push(...facts);
  }

  async startIdentificationRun(entry: IdentificationRunStartInput) {
    const runId = `run-${this.nextRunId++}`;
    this.pendingRuns.set(runId, entry);
    return { runId };
  }

  async completeIdentificationRun(entry: IdentificationRunCompleteInput) {
    const start = this.pendingRuns.get(entry.runId);
    this.pendingRuns.delete(entry.runId);
    this.runLogs.push({ ...(start as IdentificationRunStartInput), ...entry });
  }

  async startConditionAssessmentRun(entry: ConditionAssessmentRunStartInput) {
    const runId = `condition-run-${this.nextConditionRunId++}`;
    this.pendingConditionRuns.set(runId, entry);
    return { runId };
  }

  async completeConditionAssessmentRun(entry: ConditionAssessmentRunCompleteInput) {
    const start = this.pendingConditionRuns.get(entry.runId);
    this.pendingConditionRuns.delete(entry.runId);
    this.conditionRunLogs.push({
      ...(start as ConditionAssessmentRunStartInput),
      ...entry,
    });
  }

  async markPhotosInspected(photoIds: string[]) {
    this.inspectedPhotoIds.push(...photoIds);
  }

  async transitionItemStatus(_itemId: string, status: ItemStatusValue) {
    this.statusHistory.push(status);
  }

  async completeJob(jobId: string, progress: number) {
    this.completed.push({ jobId, progress });
  }

  async failJob(
    jobId: string,
    error: string,
    outcome: 'RETRY' | 'FAILED',
    retryAt?: Date,
  ) {
    this.failed.push({ jobId, error, outcome, retryAt });
  }

  async getIdentityFacts(_itemId: string) {
    return this.identityFacts;
  }

  async enqueueJob(input: { itemId: string; type: string; idempotencyKey: string }) {
    this.enqueued.push(input);
  }

  async saveComparableSales() {}

  async startMatchClassificationRun() {
    return { runId: 'match-run-unused' };
  }

  async completeMatchClassificationRun() {}

  async logItemEvent() {}
}

class MemoryObjectStore implements ObjectStore {
  objects = new Map<string, Uint8Array>();

  async put(key: string, body: Uint8Array) {
    this.objects.set(key, body);
    return { key, byteSize: body.byteLength };
  }

  async get(key: string) {
    const body = this.objects.get(key);
    if (!body) throw new Error(`No object stored for ${key}`);
    return body;
  }

  async remove(key: string) {
    this.objects.delete(key);
  }
}

class StubVisionProvider implements VisionIdentificationProvider {
  readonly provider = 'stub-provider';
  readonly model = 'stub-model';
  received?: PhotoForIdentification[];
  result: IdentificationResult | Error;

  constructor(result: IdentificationResult | Error) {
    this.result = result;
  }

  async identify(photos: PhotoForIdentification[]) {
    this.received = photos;
    if (this.result instanceof Error) throw this.result;
    return {
      result: this.result,
      usage: { inputTokens: 1234, outputTokens: 567 },
    };
  }
}

class StubConditionProvider implements ConditionAssessmentProvider {
  readonly provider = 'stub-condition-provider';
  readonly model = 'stub-condition-model';
  received?: PhotoForIdentification[];
  result: ConditionAssessmentResult | Error;

  constructor(result: ConditionAssessmentResult | Error) {
    this.result = result;
  }

  async assess(photos: PhotoForIdentification[]) {
    this.received = photos;
    if (this.result instanceof Error) throw this.result;
    return {
      result: this.result,
      usage: { inputTokens: 111, outputTokens: 22 },
    };
  }
}

class StubPhotoConverter implements PhotoConverter {
  received: PhotoForConversion[] = [];

  async convert(photo: PhotoForConversion): Promise<ConvertedPhoto> {
    this.received.push(photo);
    if (photo.mediaType !== 'image/heic') return photo;
    return { mediaType: 'image/jpeg', buffer: Buffer.from([4, 5, 6]) };
  }
}

function seedItem(
  jobs: MemoryResearchJobRepository,
  objectStore: MemoryObjectStore,
  itemId: string,
  jobId: string,
) {
  jobs.queue.push({ id: jobId, itemId, type: 'inspect_images', attempt: 0 });
  jobs.photosByItem.set(itemId, [
    {
      id: 'photo-1',
      objectKey: `items/${itemId}/photo-1.jpg`,
      mediaType: 'image/jpeg',
    },
  ]);
  objectStore.objects.set(
    `items/${itemId}/photo-1.jpg`,
    new Uint8Array([1, 2, 3]),
  );
}

void test('claims a queued job, saves facts and marks the item researching', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-1', 'job-1');
  const vision = new StubVisionProvider({
    candidates: [
      {
        itemType: 'wireless keyboard',
        manufacturer: 'Apple',
        confidence: 0.92,
        evidence: 'Apple logo and keycap shape visible',
      },
    ],
    openQuestions: [],
    canSearchEbayConfidently: true,
  });

  const result = await runInspectImagesJob({ jobs, objectStore, vision });

  assert.deepEqual(result, {
    claimed: true,
    itemId: 'item-1',
    outcome: 'succeeded',
  });
  assert.equal(
    vision.received?.[0]?.base64,
    Buffer.from([1, 2, 3]).toString('base64'),
  );
  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING', 'RESEARCHING']);
  assert.deepEqual(jobs.inspectedPhotoIds, ['photo-1']);
  assert.deepEqual(jobs.completed, [{ jobId: 'job-1', progress: 100 }]);
  assert.equal(jobs.enqueued.length, 1);
  assert.equal(jobs.enqueued[0]?.itemId, 'item-1');
  assert.equal(jobs.enqueued[0]?.type, 'research_comparable_sales');
  const manufacturerFact = jobs.savedFacts.find(
    (fact) => fact.field === 'identity.manufacturer',
  );
  assert.equal(manufacturerFact?.value, JSON.stringify('Apple'));
  assert.equal(manufacturerFact?.origin, 'image_inference');

  assert.equal(jobs.runLogs.length, 1);
  const run = jobs.runLogs[0];
  assert.equal(run?.outcome, 'succeeded');
  assert.equal(run?.provider, 'stub-provider');
  assert.equal(run?.model, 'stub-model');
  assert.equal(run?.inputTokens, 1234);
  assert.equal(run?.outputTokens, 567);
  assert.deepEqual(
    (run?.response as { candidates: unknown[] } | undefined)?.candidates
      .length,
    1,
  );
});

void test('skips condition assessment entirely when no condition provider is configured', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-1b', 'job-1b');
  const vision = new StubVisionProvider({
    candidates: [
      { itemType: 'wireless keyboard', confidence: 0.92, evidence: 'Apple logo visible' },
    ],
    openQuestions: [],
    canSearchEbayConfidently: true,
  });

  await runInspectImagesJob({ jobs, objectStore, vision });

  assert.equal(jobs.conditionRunLogs.length, 0);
  assert.ok(!jobs.savedFacts.some((fact) => fact.field.startsWith('condition.')));
});

void test('runs condition assessment alongside identification and saves condition facts', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-5', 'job-5');
  const vision = new StubVisionProvider({
    candidates: [
      { itemType: 'wireless keyboard', confidence: 0.92, evidence: 'Apple logo visible' },
    ],
    openQuestions: [],
    canSearchEbayConfidently: true,
  });
  const condition = new StubConditionProvider({
    overallGrade: { grade: 'very_good', confidence: 0.9, evidence: 'Minor scuffs on the base' },
    cosmeticWear: { value: 'Light scuffing on the plastic underside', confidence: 0.85, evidence: 'Visible in photo 1' },
    openQuestions: [],
  });

  const result = await runInspectImagesJob({ jobs, objectStore, vision, condition });

  assert.deepEqual(result, { claimed: true, itemId: 'item-5', outcome: 'succeeded' });
  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING', 'RESEARCHING']);
  assert.equal(condition.received?.[0]?.base64, Buffer.from([1, 2, 3]).toString('base64'));

  assert.equal(jobs.conditionRunLogs.length, 1);
  const conditionRun = jobs.conditionRunLogs[0];
  assert.equal(conditionRun?.outcome, 'succeeded');
  assert.equal(conditionRun?.provider, 'stub-condition-provider');
  assert.equal(conditionRun?.inputTokens, 111);

  const gradeFact = jobs.savedFacts.find((fact) => fact.field === 'condition.overall_grade');
  assert.equal(gradeFact?.value, JSON.stringify('very_good'));
  assert.equal(gradeFact?.confidence, 0.9);
  const wearFact = jobs.savedFacts.find((fact) => fact.field === 'condition.cosmetic_wear');
  assert.equal(wearFact?.value, JSON.stringify('Light scuffing on the plastic underside'));
});

void test('a low-confidence or questioning condition assessment does not block research when identification is confident', async () => {
  // Research only needs identity facts to build eBay search keywords (see
  // buildSearchKeywords in research-comparable-sales-job.ts) -- an
  // uncertain condition grade has no bearing on that step, so it must not
  // hold up research the way an identity open question correctly does.
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-6', 'job-6');
  const vision = new StubVisionProvider({
    candidates: [
      { itemType: 'wireless keyboard', confidence: 0.95, evidence: 'Apple logo visible' },
    ],
    openQuestions: [],
    canSearchEbayConfidently: true,
  });
  const condition = new StubConditionProvider({
    overallGrade: { grade: 'good', confidence: 0.4, evidence: 'Hard to tell wear level from the angle shown' },
    openQuestions: ["Can you show the underside so we can check for scratches?"],
  });

  const result = await runInspectImagesJob({ jobs, objectStore, vision, condition });

  assert.deepEqual(result, { claimed: true, itemId: 'item-6', outcome: 'succeeded' });
  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING', 'RESEARCHING']);
  assert.equal(jobs.enqueued.length, 1);
  assert.equal(jobs.enqueued[0]?.type, 'research_comparable_sales');
  // The low confidence and open question are still recorded, just not
  // blocking -- see deriveAttention for how they surface non-blockingly.
  const gradeFact = jobs.savedFacts.find((fact) => fact.field === 'condition.overall_grade');
  assert.equal(gradeFact?.confidence, 0.4);
  const openQuestionsFact = jobs.savedFacts.find((fact) => fact.field === 'condition.open_questions');
  assert.deepEqual(JSON.parse(openQuestionsFact?.value ?? '[]'), [
    'Can you show the underside so we can check for scratches?',
  ]);
});

void test('a failing condition provider fails the whole inspect_images job', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-7', 'job-7');
  const vision = new StubVisionProvider({
    candidates: [
      { itemType: 'wireless keyboard', confidence: 0.95, evidence: 'Apple logo visible' },
    ],
    openQuestions: [],
    canSearchEbayConfidently: true,
  });
  const condition = new StubConditionProvider(new Error('condition provider timed out'));

  const result = await runInspectImagesJob({ jobs, objectStore, vision, condition, maxAttempts: 5 });

  assert.deepEqual(result, { claimed: true, itemId: 'item-7', outcome: 'failed' });
  assert.equal(jobs.conditionRunLogs.length, 1);
  assert.equal(jobs.conditionRunLogs[0]?.outcome, 'failed');
  assert.equal(jobs.conditionRunLogs[0]?.errorMessage, 'condition provider timed out');
  assert.ok(
    !jobs.savedFacts.some((fact) => fact.field.startsWith('identity.') || fact.field.startsWith('condition.')),
    'facts are only saved once both calls succeed',
  );
});

void test('converts each photo through the photo converter before identification', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  jobs.queue.push({ id: 'job-4', itemId: 'item-4', type: 'inspect_images', attempt: 0 });
  jobs.photosByItem.set('item-4', [
    {
      id: 'photo-1',
      objectKey: 'items/item-4/photo-1.heic',
      mediaType: 'image/heic',
    },
  ]);
  objectStore.objects.set(
    'items/item-4/photo-1.heic',
    new Uint8Array([1, 2, 3]),
  );
  const photoConverter = new StubPhotoConverter();
  const vision = new StubVisionProvider({
    candidates: [
      {
        itemType: 'wireless keyboard',
        confidence: 0.92,
        evidence: 'Apple logo visible',
      },
    ],
    openQuestions: [],
    canSearchEbayConfidently: true,
  });

  await runInspectImagesJob({ jobs, objectStore, vision, photoConverter });

  assert.deepEqual(photoConverter.received, [
    { mediaType: 'image/heic', buffer: Buffer.from([1, 2, 3]) },
  ]);
  assert.equal(vision.received?.[0]?.mediaType, 'image/jpeg');
  assert.equal(
    vision.received?.[0]?.base64,
    Buffer.from([4, 5, 6]).toString('base64'),
  );
});

void test('routes low-confidence identification to needs information', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-2', 'job-2');
  const vision = new StubVisionProvider({
    candidates: [
      {
        itemType: 'graphics card',
        confidence: 0.4,
        evidence: 'Fan shroud visible but no legible label',
      },
    ],
    openQuestions: ['Which memory capacity variant is this?'],
    canSearchEbayConfidently: true,
  });

  await runInspectImagesJob({ jobs, objectStore, vision });

  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING', 'NEEDS_INFORMATION']);
  const openQuestionsFact = jobs.savedFacts.find(
    (fact) => fact.field === 'identity.open_questions',
  );
  assert.deepEqual(JSON.parse(openQuestionsFact?.value ?? '[]'), [
    'Which memory capacity variant is this?',
  ]);
  assert.deepEqual(
    jobs.enqueued,
    [],
    'no research job should be queued until identification is actually confident',
  );
});

void test('routes a confident-but-generic identification to needs information, even with no open question', async () => {
  // Real ask: 97% sure this is "a wireless keyboard" with no manufacturer
  // or model still can't drive a useful eBay search -- confidence alone
  // isn't enough, and the model may not think to raise it as its own
  // openQuestions entry.
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-8', 'job-8');
  const vision = new StubVisionProvider({
    candidates: [
      { itemType: 'wireless keyboard', confidence: 0.97, evidence: 'Keycap shape and shroud visible' },
    ],
    openQuestions: [],
    canSearchEbayConfidently: false,
    searchReadinessNote: 'No manufacturer, model or label is visible in any photo.',
  });

  await runInspectImagesJob({ jobs, objectStore, vision });

  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING', 'NEEDS_INFORMATION']);
  assert.deepEqual(jobs.enqueued, []);
  const openQuestionsFact = jobs.savedFacts.find((fact) => fact.field === 'identity.open_questions');
  assert.deepEqual(JSON.parse(openQuestionsFact?.value ?? '[]'), [
    'No manufacturer, model or label is visible in any photo.',
  ]);
});

void test('proceeds to research when canSearchEbayConfidently is true and there are no open questions', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-9', 'job-9');
  const vision = new StubVisionProvider({
    candidates: [
      { itemType: 'wireless keyboard', manufacturer: 'Apple', model: 'Magic Keyboard', confidence: 0.97, evidence: 'Apple logo and model label visible' },
    ],
    openQuestions: [],
    canSearchEbayConfidently: true,
  });

  await runInspectImagesJob({ jobs, objectStore, vision });

  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING', 'RESEARCHING']);
  assert.equal(jobs.enqueued.length, 1);
});

void test('returns claimed:false when no job is queued', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  const vision = new StubVisionProvider({ candidates: [], openQuestions: [], canSearchEbayConfidently: true });

  const result = await runInspectImagesJob({ jobs, objectStore, vision });

  assert.deepEqual(result, { claimed: false });
});

void test('retries a failed job while attempts remain, then gives up', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  seedItem(jobs, objectStore, 'item-3', 'job-3');
  const vision = new StubVisionProvider(new Error('vision provider timed out'));

  const first = await runInspectImagesJob({
    jobs,
    objectStore,
    vision,
    maxAttempts: 2,
    now: () => new Date('2026-09-04T00:00:00Z'),
  });
  assert.deepEqual(first, {
    claimed: true,
    itemId: 'item-3',
    outcome: 'failed',
  });
  assert.deepEqual(jobs.failed, [
    {
      jobId: 'job-3',
      error: 'vision provider timed out',
      outcome: 'RETRY',
      retryAt: new Date('2026-09-04T00:00:05Z'),
    },
  ]);
  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING']);

  // Simulate the retry: the job is back in QUEUED state (attempt now 1).
  jobs.queue = [
    { id: 'job-3', itemId: 'item-3', type: 'inspect_images', attempt: 1 },
  ];
  const second = await runInspectImagesJob({
    jobs,
    objectStore,
    vision,
    maxAttempts: 2,
  });
  assert.deepEqual(second, {
    claimed: true,
    itemId: 'item-3',
    outcome: 'failed',
  });
  assert.equal(jobs.failed[1]?.outcome, 'FAILED');
  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING', 'IDENTIFYING', 'FAILED']);

  assert.equal(jobs.runLogs.length, 2);
  assert.ok(
    jobs.runLogs.every(
      (run) =>
        run.outcome === 'failed' &&
        run.errorMessage === 'vision provider timed out' &&
        run.provider === 'stub-provider' &&
        run.model === 'stub-model' &&
        run.inputTokens === undefined &&
        run.response === undefined,
    ),
  );
});

void test('uses the default max attempts when none is supplied', () => {
  assert.equal(DEFAULT_MAX_ATTEMPTS, 5);
});

void test('backs retries off exponentially and caps the delay', () => {
  assert.equal(retryDelayMs(1), BASE_RETRY_DELAY_MS);
  assert.equal(retryDelayMs(2), BASE_RETRY_DELAY_MS * 2);
  assert.equal(retryDelayMs(99), 5 * 60 * 1000);
});
