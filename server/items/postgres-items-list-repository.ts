import { desc } from 'drizzle-orm';

import { items } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import type { ItemsListRepository } from './items-list-repository';

export class PostgresItemsListRepository implements ItemsListRepository {
  async listAllItemIds(): Promise<string[]> {
    const database = getDatabase();
    const rows = await database
      .select({ id: items.id })
      .from(items)
      .orderBy(desc(items.updatedAt));
    return rows.map((row) => row.id);
  }
}
