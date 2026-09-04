import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../app/api/items/[id]/route';
import { GET as GET_PHOTO } from '../app/api/items/[id]/photos/[photoId]/route';
import { POST as POST_RETRY } from '../app/api/items/[id]/retry/route';

function withCaptureDisabled<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.CAPTURE_API_ENABLED;
  delete process.env.CAPTURE_API_ENABLED;
  return run().finally(() => {
    if (previous === undefined) delete process.env.CAPTURE_API_ENABLED;
    else process.env.CAPTURE_API_ENABLED = previous;
  });
}

void test('GET /api/items/[id] returns 404 while persistent capture is disabled', async () => {
  await withCaptureDisabled(async () => {
    const response = await GET(new Request('http://localhost/api/items/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Item not found' });
  });
});

void test('GET /api/items/[id] rejects a cross-origin request before touching the database', async () => {
  const response = await GET(
    new Request('http://localhost/api/items/abc', {
      headers: { origin: 'https://attacker.example' },
    }),
    { params: Promise.resolve({ id: 'abc' }) },
  );
  assert.equal(response.status, 403);
});

void test('GET /api/items/[id]/photos/[photoId] returns 404 while persistent capture is disabled', async () => {
  await withCaptureDisabled(async () => {
    const response = await GET_PHOTO(
      new Request('http://localhost/api/items/abc/photos/def'),
      { params: Promise.resolve({ id: 'abc', photoId: 'def' }) },
    );
    assert.equal(response.status, 404);
  });
});

void test('GET /api/items/[id]/photos/[photoId] rejects a cross-origin request', async () => {
  const response = await GET_PHOTO(
    new Request('http://localhost/api/items/abc/photos/def', {
      headers: { origin: 'https://attacker.example' },
    }),
    { params: Promise.resolve({ id: 'abc', photoId: 'def' }) },
  );
  assert.equal(response.status, 403);
});

void test('POST /api/items/[id]/retry returns 404 while persistent capture is disabled', async () => {
  await withCaptureDisabled(async () => {
    const response = await POST_RETRY(
      new Request('http://localhost/api/items/abc/retry', { method: 'POST' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    assert.equal(response.status, 404);
  });
});

void test('POST /api/items/[id]/retry rejects a cross-origin request', async () => {
  const response = await POST_RETRY(
    new Request('http://localhost/api/items/abc/retry', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    }),
    { params: Promise.resolve({ id: 'abc' }) },
  );
  assert.equal(response.status, 403);
});
