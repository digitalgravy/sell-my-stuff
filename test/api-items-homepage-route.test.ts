import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../app/api/items/homepage/route';

void test('returns an empty snapshot while persistent capture is disabled', async () => {
  const previous = process.env.CAPTURE_API_ENABLED;
  delete process.env.CAPTURE_API_ENABLED;

  try {
    const response = await GET(new Request('http://localhost/api/items/homepage'));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { attention: [], working: [] });
  } finally {
    if (previous === undefined) delete process.env.CAPTURE_API_ENABLED;
    else process.env.CAPTURE_API_ENABLED = previous;
  }
});

void test('rejects a cross-origin request before touching the database', async () => {
  const response = await GET(
    new Request('http://localhost/api/items/homepage', {
      headers: { origin: 'https://attacker.example' },
    }),
  );

  assert.equal(response.status, 403);
});
