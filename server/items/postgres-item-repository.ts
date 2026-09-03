import { jobs, items, photos } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import type { ItemCapture, ItemRepository } from './types';

export class PostgresItemRepository implements ItemRepository {
  async createCapture(capture: ItemCapture): Promise<void> {
    const database = getDatabase();
    await database.transaction(async (transaction) => {
      await transaction.insert(items).values({
        id: capture.itemId,
        revision: capture.revision,
      });
      await transaction.insert(photos).values(
        capture.photos.map((photo) => ({
          id: photo.id,
          itemId: capture.itemId,
          objectKey: photo.objectKey,
          originalName: photo.originalName,
          mediaType: photo.mediaType,
          byteSize: photo.byteSize,
          sha256: photo.sha256,
          position: photo.position,
        })),
      );
      await transaction.insert(jobs).values({
        id: capture.jobId,
        itemId: capture.itemId,
        type: 'inspect_images',
        idempotencyKey: `inspect_images:${capture.itemId}:${capture.revision}`,
      });
    });
  }
}
