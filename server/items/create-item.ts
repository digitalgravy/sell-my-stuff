import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';

import type { ObjectStore } from '@/server/storage/object-store';

import type { CapturedPhoto, ItemCapture, ItemRepository } from './types';

const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 150 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
]);

export class CaptureValidationError extends Error {}

export async function createItemFromPhotos(
  files: File[],
  dependencies: { objectStore: ObjectStore; repository: ItemRepository },
): Promise<ItemCapture> {
  if (files.length === 0)
    throw new CaptureValidationError('Add at least one photo');
  if (files.length > MAX_PHOTOS) {
    throw new CaptureValidationError(
      `Add no more than ${MAX_PHOTOS} photos at once`,
    );
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_CAPTURE_BYTES) {
    throw new CaptureValidationError(
      'This capture is too large; keep the photos under 150 MB total',
    );
  }
  if (files.some((file) => file.size > MAX_PHOTO_BYTES)) {
    throw new CaptureValidationError('Each photo must be 25 MB or smaller');
  }

  const itemId = randomUUID();
  const jobId = randomUUID();
  const storedKeys: string[] = [];
  const capturedPhotos: CapturedPhoto[] = [];

  try {
    for (const [position, file] of files.entries()) {
      const body = new Uint8Array(await file.arrayBuffer());
      const detected = await fileTypeFromBuffer(body);
      if (!detected || !ALLOWED_MEDIA_TYPES.has(detected.mime)) {
        throw new CaptureValidationError(
          `${file.name || 'A photo'} is not a supported HEIC, JPEG or PNG image`,
        );
      }

      const photoId = randomUUID();
      const objectKey = `items/${itemId}/original/${photoId}.${detected.ext}`;
      await dependencies.objectStore.put(objectKey, body);
      storedKeys.push(objectKey);
      capturedPhotos.push({
        id: photoId,
        objectKey,
        originalName: file.name || `photo-${position + 1}.${detected.ext}`,
        mediaType: detected.mime,
        byteSize: body.byteLength,
        sha256: createHash('sha256').update(body).digest('hex'),
        position,
      });
    }

    const capture: ItemCapture = {
      itemId,
      jobId,
      revision: 1,
      photos: capturedPhotos,
    };
    await dependencies.repository.createCapture(capture);
    return capture;
  } catch (error) {
    await Promise.allSettled(
      storedKeys.map((key) => dependencies.objectStore.remove(key)),
    );
    throw error;
  }
}
