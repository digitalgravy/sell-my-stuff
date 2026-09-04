import { getPhotoConverter } from '@/server/ai/heic-photo-converter';
import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { PostgresItemDetailRepository } from '@/server/items/postgres-item-detail-repository';
import { getFileObjectStore } from '@/server/storage/file-object-store';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json(
      { error: 'Untrusted request origin' },
      { status: 403 },
    );
  }
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ error: 'Photo not found' }, { status: 404 });
  }

  const { id, photoId } = await params;

  try {
    const photo = await new PostgresItemDetailRepository().getPhotoForItem(
      id,
      photoId,
    );
    if (!photo) {
      return Response.json({ error: 'Photo not found' }, { status: 404 });
    }

    const original = Buffer.from(
      await getFileObjectStore().get(photo.objectKey),
    );
    // Most browsers can't render HEIC/HEIF directly — convert for display,
    // same converter the worker uses before identification.
    const { mediaType, buffer } = await getPhotoConverter().convert({
      mediaType: photo.mediaType,
      buffer: original,
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mediaType,
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error(
      'Failed to load a photo',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json({ error: 'Could not load this photo' }, { status: 500 });
  }
}
