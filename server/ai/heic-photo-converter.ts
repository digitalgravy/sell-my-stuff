import convert from 'heic-convert';

import {
  needsConversion,
  type ConvertedPhoto,
  type PhotoConverter,
  type PhotoForConversion,
} from './photo-conversion';

const JPEG_QUALITY = 0.92;

/**
 * Converts HEIC/HEIF photos (the default iPhone capture format) to JPEG using
 * a pure-JS/WASM libheif build, so no native libvips build with HEIF support
 * is required in the runtime image. Non-HEIC photos pass through unchanged.
 */
export class HeicPhotoConverter implements PhotoConverter {
  async convert(photo: PhotoForConversion): Promise<ConvertedPhoto> {
    if (!needsConversion(photo.mediaType)) return photo;

    const jpeg = await convert({
      buffer: photo.buffer,
      format: 'JPEG',
      quality: JPEG_QUALITY,
    });
    return { mediaType: 'image/jpeg', buffer: Buffer.from(jpeg) };
  }
}

let sharedConverter: HeicPhotoConverter | undefined;

export function getPhotoConverter(): PhotoConverter {
  if (!sharedConverter) sharedConverter = new HeicPhotoConverter();
  return sharedConverter;
}
