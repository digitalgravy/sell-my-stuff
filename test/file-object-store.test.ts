import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FileObjectStore } from '../server/storage/file-object-store';

void test('writes objects beneath its configured root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sell-object-store-'));
  const store = new FileObjectStore(root);
  const body = new Uint8Array([1, 2, 3]);

  await store.put('items/item-id/original/photo-id.png', body);

  const saved = await readFile(
    path.join(root, 'items/item-id/original/photo-id.png'),
  );
  assert.deepEqual(saved, Buffer.from(body));
});

void test('reads back exactly what was written', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sell-object-store-'));
  const store = new FileObjectStore(root);
  const body = new Uint8Array([9, 8, 7, 6]);

  await store.put('items/item-id/original/photo-id.png', body);
  const read = await store.get('items/item-id/original/photo-id.png');

  assert.deepEqual(read, body);
});

void test('rejects traversal and absolute object keys', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sell-object-store-'));
  const store = new FileObjectStore(root);

  await assert.rejects(
    store.put('../outside', new Uint8Array([1])),
    /Invalid object key/,
  );
  await assert.rejects(
    store.put('/tmp/outside', new Uint8Array([1])),
    /Invalid object key/,
  );
});
