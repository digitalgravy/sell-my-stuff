import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { buildItemListEntry } from '@/server/items/items-list';
import { PostgresItemsListRepository } from '@/server/items/postgres-items-list-repository';
import { PostgresItemDetailRepository } from '@/server/items/postgres-item-detail-repository';
import type { ItemDetail } from '@/server/items/item-detail-repository';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  // No persistence exists until capture is enabled, so there are truthfully
  // zero items rather than an error to surface.
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ items: [] });
  }

  try {
    const ids = await new PostgresItemsListRepository().listAllItemIds();
    const detailRepository = new PostgresItemDetailRepository();
    const details = await Promise.all(ids.map((id) => detailRepository.getItemDetail(id)));
    const entries = details
      .filter((detail): detail is ItemDetail => detail !== null)
      .map((detail) => buildItemListEntry(detail));
    return Response.json({ items: entries });
  } catch (error) {
    console.error('Failed to load items list', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Could not load items' }, { status: 500 });
  }
}
