import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CaptureValidationError,
  createItemFromPhotos,
} from '../server/items/create-item';
import type { ItemCapture, ItemRepository } from '../server/items/types';
import type { ObjectStore } from '../server/storage/object-store';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, Uint8Array>();
  readonly removed: string[] = [];

  async put(key: string, body: Uint8Array) {
    this.objects.set(key, body);
    return { key, byteSize: body.byteLength };
  }

  async remove(key: string) {
    this.objects.delete(key);
    this.removed.push(key);
  }
}

class MemoryItemRepository implements ItemRepository {
  capture?: ItemCapture;
  fail = false;

  async createCapture(capture: ItemCapture) {
    if (this.fail) throw new Error('database unavailable');
    this.capture = capture;
  }
}

void test('stores verified image bytes and creates one durable inspection job', async () => {
  const objectStore = new MemoryObjectStore();
  const repository = new MemoryItemRepository();
  const file = new File([PNG_BYTES], 'front.png', { type: 'image/png' });

  const capture = await createItemFromPhotos([file], {
    objectStore,
    repository,
  });

  assert.equal(capture.revision, 1);
  assert.equal(capture.photos.length, 1);
  assert.equal(capture.photos[0]?.mediaType, 'image/png');
  assert.equal(capture.photos[0]?.position, 0);
  assert.match(capture.photos[0]?.sha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(repository.capture?.jobId, capture.jobId);
  assert.equal(objectStore.objects.size, 1);
});

void test('rejects a renamed non-image before persisting metadata', async () => {
  const objectStore = new MemoryObjectStore();
  const repository = new MemoryItemRepository();
  const file = new File(['not an image'], 'misleading.png', {
    type: 'image/png',
  });

  await assert.rejects(
    createItemFromPhotos([file], { objectStore, repository }),
    CaptureValidationError,
  );
  assert.equal(repository.capture, undefined);
  assert.equal(objectStore.objects.size, 0);
});

void test('removes stored objects when the database transaction fails', async () => {
  const objectStore = new MemoryObjectStore();
  const repository = new MemoryItemRepository();
  repository.fail = true;
  const file = new File([PNG_BYTES], 'front.png', { type: 'image/png' });

  await assert.rejects(
    createItemFromPhotos([file], { objectStore, repository }),
    /database unavailable/,
  );
  assert.equal(objectStore.objects.size, 0);
  assert.equal(objectStore.removed.length, 1);
});

void test('requires at least one photo and caps each capture at twelve', async () => {
  const objectStore = new MemoryObjectStore();
  const repository = new MemoryItemRepository();

  await assert.rejects(
    createItemFromPhotos([], { objectStore, repository }),
    CaptureValidationError,
  );
  const files = Array.from(
    { length: 13 },
    (_, index) => new File([PNG_BYTES], `${index}.png`, { type: 'image/png' }),
  );
  await assert.rejects(
    createItemFromPhotos(files, { objectStore, repository }),
    CaptureValidationError,
  );
});
