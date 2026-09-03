import {
  CaptureValidationError,
  createItemFromPhotos,
} from '@/server/items/create-item';
import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { PostgresItemRepository } from '@/server/items/postgres-item-repository';
import { getFileObjectStore } from '@/server/storage/file-object-store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json(
      { error: 'Untrusted request origin' },
      { status: 403 },
    );
  }
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json(
      { error: 'Capture persistence is not enabled' },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const files = form
      .getAll('photos')
      .filter((entry): entry is File => entry instanceof File);
    const capture = await createItemFromPhotos(files, {
      objectStore: getFileObjectStore(),
      repository: new PostgresItemRepository(),
    });
    return Response.json(
      {
        item: {
          id: capture.itemId,
          revision: capture.revision,
          status: 'INBOX',
          photoCount: capture.photos.length,
        },
        job: { id: capture.jobId, type: 'inspect_images', state: 'QUEUED' },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CaptureValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Failed to create item capture',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json(
      { error: 'The photos could not be saved. Please try again.' },
      { status: 500 },
    );
  }
}
