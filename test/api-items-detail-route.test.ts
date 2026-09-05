import assert from 'node:assert/strict';
import test from 'node:test';

import { DELETE, GET } from '../app/api/items/[id]/route';
import { GET as GET_PHOTO } from '../app/api/items/[id]/photos/[photoId]/route';
import { POST as POST_RETRY } from '../app/api/items/[id]/retry/route';
import { POST as POST_CORRECT } from '../app/api/items/[id]/facts/correct/route';
import { GET as GET_SAMPLE } from '../app/api/items/sample/route';
import { GET as GET_SAMPLE_PHOTO } from '../app/api/items/sample/photos/[photoId]/route';

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

void test('DELETE /api/items/[id] returns 404 while persistent capture is disabled', async () => {
  await withCaptureDisabled(async () => {
    const response = await DELETE(
      new Request('http://localhost/api/items/abc', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    assert.equal(response.status, 404);
  });
});

void test('DELETE /api/items/[id] rejects a cross-origin request', async () => {
  const response = await DELETE(
    new Request('http://localhost/api/items/abc', {
      method: 'DELETE',
      headers: { origin: 'https://attacker.example' },
    }),
    { params: Promise.resolve({ id: 'abc' }) },
  );
  assert.equal(response.status, 403);
});

void test('POST /api/items/[id]/facts/correct returns 404 while persistent capture is disabled', async () => {
  await withCaptureDisabled(async () => {
    const response = await POST_CORRECT(
      new Request('http://localhost/api/items/abc/facts/correct', {
        method: 'POST',
        body: JSON.stringify({ field: 'identity.colour', value: 'Black' }),
      }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    assert.equal(response.status, 404);
  });
});

void test('POST /api/items/[id]/facts/correct rejects a cross-origin request', async () => {
  const response = await POST_CORRECT(
    new Request('http://localhost/api/items/abc/facts/correct', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
      body: JSON.stringify({ field: 'identity.colour', value: 'Black' }),
    }),
    { params: Promise.resolve({ id: 'abc' }) },
  );
  assert.equal(response.status, 403);
});

void test('GET /api/items/sample returns fully-populated fake data, ignoring the capture gate', async () => {
  await withCaptureDisabled(async () => {
    const response = await GET_SAMPLE(new Request('http://localhost/api/items/sample'));
    assert.equal(response.status, 200);
    const detail = (await response.json()) as { id: string; pricing?: unknown; listing?: unknown; evidence?: unknown };
    assert.equal(detail.id, 'sample');
    assert.ok(detail.pricing);
    assert.ok(detail.listing);
    assert.ok(detail.evidence);
  });
});

void test('GET /api/items/sample rejects a cross-origin request', async () => {
  const response = await GET_SAMPLE(
    new Request('http://localhost/api/items/sample', {
      headers: { origin: 'https://attacker.example' },
    }),
  );
  assert.equal(response.status, 403);
});

void test('GET /api/items/sample/photos/[photoId] returns a placeholder image for a known sample photo', async () => {
  const response = await GET_SAMPLE_PHOTO(
    new Request('http://localhost/api/items/sample/photos/photo-1'),
    { params: Promise.resolve({ photoId: 'photo-1' }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/svg+xml');
});

void test('GET /api/items/sample/photos/[photoId] returns 404 for an unknown photo id', async () => {
  const response = await GET_SAMPLE_PHOTO(
    new Request('http://localhost/api/items/sample/photos/nope'),
    { params: Promise.resolve({ photoId: 'nope' }) },
  );
  assert.equal(response.status, 404);
});
