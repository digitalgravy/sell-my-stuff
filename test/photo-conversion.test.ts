import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  identityPhotoConverter,
  needsConversion,
} from '../server/ai/photo-conversion';
import { HeicPhotoConverter } from '../server/ai/heic-photo-converter';

void test('needsConversion recognises HEIC and HEIF, case-insensitively', () => {
  assert.equal(needsConversion('image/heic'), true);
  assert.equal(needsConversion('IMAGE/HEIF'), true);
  assert.equal(needsConversion('image/jpeg'), false);
  assert.equal(needsConversion('image/png'), false);
});

void test('identityPhotoConverter returns the photo unchanged', async () => {
  const buffer = Buffer.from([1, 2, 3]);
  const result = await identityPhotoConverter.convert({
    mediaType: 'image/heic',
    buffer,
  });
  assert.equal(result.mediaType, 'image/heic');
  assert.equal(result.buffer, buffer);
});

void test('HeicPhotoConverter passes non-HEIC photos through unchanged', async () => {
  const converter = new HeicPhotoConverter();
  const buffer = Buffer.from([9, 9, 9]);
  const result = await converter.convert({ mediaType: 'image/jpeg', buffer });
  assert.equal(result.mediaType, 'image/jpeg');
  assert.equal(result.buffer, buffer);
});

// Real HEIC decoding goes through a WASM build of libheif and is slow/heavy
// to fixture in CI, so this only runs when a real .heic file is pointed to
// locally via HEIC_TEST_FIXTURE (see DEVELOPMENT.md).
const fixturePath = process.env.HEIC_TEST_FIXTURE;
void test(
  'HeicPhotoConverter converts a real HEIC photo to a decodable JPEG',
  { skip: !fixturePath || !existsSync(fixturePath) },
  async () => {
    const converter = new HeicPhotoConverter();
    const heicBuffer = await readFile(path.resolve(fixturePath!));
    const result = await converter.convert({
      mediaType: 'image/heic',
      buffer: heicBuffer,
    });

    assert.equal(result.mediaType, 'image/jpeg');
    // JPEG SOI marker
    assert.equal(result.buffer[0], 0xff);
    assert.equal(result.buffer[1], 0xd8);
  },
);
