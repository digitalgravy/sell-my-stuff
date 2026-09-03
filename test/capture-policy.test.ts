import assert from 'node:assert/strict';
import test from 'node:test';

import { isSupportedImage } from '../lib/capture-policy';

void test('accepts the supported photo formats by MIME type', () => {
  assert.equal(isSupportedImage({ name: 'capture', type: 'image/heic' }), true);
  assert.equal(isSupportedImage({ name: 'capture', type: 'image/heif' }), true);
  assert.equal(isSupportedImage({ name: 'capture', type: 'image/jpeg' }), true);
  assert.equal(isSupportedImage({ name: 'capture', type: 'image/png' }), true);
});

void test('falls back to a supported extension for imperfect mobile metadata', () => {
  assert.equal(isSupportedImage({ name: 'IMG_0042.HEIC', type: '' }), true);
  assert.equal(
    isSupportedImage({ name: 'item.jpeg', type: 'application/octet-stream' }),
    true,
  );
});

void test('rejects non-image files and unsupported image formats', () => {
  assert.equal(
    isSupportedImage({ name: 'notes.pdf', type: 'application/pdf' }),
    false,
  );
  assert.equal(
    isSupportedImage({ name: 'animation.gif', type: 'image/gif' }),
    false,
  );
});
