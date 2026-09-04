const HEIC_MEDIA_TYPES = new Set(['image/heic', 'image/heif']);

export interface PhotoForConversion {
  mediaType: string;
  buffer: Buffer;
}

export interface ConvertedPhoto {
  mediaType: string;
  buffer: Buffer;
}

export interface PhotoConverter {
  convert(photo: PhotoForConversion): Promise<ConvertedPhoto>;
}

export function needsConversion(mediaType: string): boolean {
  return HEIC_MEDIA_TYPES.has(mediaType.toLowerCase());
}

/** Passes every photo through unchanged; used where a caller has no reason to convert (e.g. tests). */
export const identityPhotoConverter: PhotoConverter = {
  async convert(photo) {
    return photo;
  },
};
