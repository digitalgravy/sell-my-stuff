import assert from 'node:assert/strict';
import test from 'node:test';

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
  IdentificationFactInput,
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
  received?: PhotoForIdentification[];
  result: IdentificationResult | Error;

  constructor(result: IdentificationResult | Error) {
    this.result = result;
  }

  async identify(photos: PhotoForIdentification[]) {
    this.received = photos;
    if (this.result instanceof Error) throw this.result;
    return this.result;
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
  const manufacturerFact = jobs.savedFacts.find(
    (fact) => fact.field === 'identity.manufacturer',
  );
  assert.equal(manufacturerFact?.value, JSON.stringify('Apple'));
  assert.equal(manufacturerFact?.origin, 'image_inference');
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
  });

  await runInspectImagesJob({ jobs, objectStore, vision });

  assert.deepEqual(jobs.statusHistory, ['IDENTIFYING', 'NEEDS_INFORMATION']);
  const openQuestionsFact = jobs.savedFacts.find(
    (fact) => fact.field === 'identity.open_questions',
  );
  assert.deepEqual(JSON.parse(openQuestionsFact?.value ?? '[]'), [
    'Which memory capacity variant is this?',
  ]);
});

void test('returns claimed:false when no job is queued', async () => {
  const jobs = new MemoryResearchJobRepository();
  const objectStore = new MemoryObjectStore();
  const vision = new StubVisionProvider({ candidates: [], openQuestions: [] });

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
});

void test('uses the default max attempts when none is supplied', () => {
  assert.equal(DEFAULT_MAX_ATTEMPTS, 5);
});

void test('backs retries off exponentially and caps the delay', () => {
  assert.equal(retryDelayMs(1), BASE_RETRY_DELAY_MS);
  assert.equal(retryDelayMs(2), BASE_RETRY_DELAY_MS * 2);
  assert.equal(retryDelayMs(99), 5 * 60 * 1000);
});
