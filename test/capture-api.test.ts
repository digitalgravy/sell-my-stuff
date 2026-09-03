import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '../app/api/items/route';

void test('keeps persistent capture disabled until storage and database are provisioned', async () => {
  const previous = process.env.CAPTURE_API_ENABLED;
  delete process.env.CAPTURE_API_ENABLED;

  try {
    const response = await POST(
      new Request('http://localhost/api/items', {
        method: 'POST',
        body: new FormData(),
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'Capture persistence is not enabled',
    });
  } finally {
    if (previous === undefined) delete process.env.CAPTURE_API_ENABLED;
    else process.env.CAPTURE_API_ENABLED = previous;
  }
});

void test('rejects a cross-origin capture request before processing files', async () => {
  const response = await POST(
    new Request('http://localhost/api/items', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
      body: new FormData(),
    }),
  );

  assert.equal(response.status, 403);
});
