export const SUPPORTED_IMAGE_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
]);

export function isSupportedImage(file: Pick<File, 'name' | 'type'>): boolean {
  return (
    SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) ||
    /\.(heic|heif|jpe?g|png)$/i.test(file.name)
  );
}
