import type { Metadata } from 'next';

import { displayTitle } from '@/components/item-detail/format';
import { ItemDetailView } from '@/components/item-detail/item-detail-view';
import { PostgresItemDetailRepository } from '@/server/items/postgres-item-detail-repository';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await new PostgresItemDetailRepository().getItemDetail(id);
  return detail ? { title: displayTitle(detail) } : {};
}

// Optional catch-all so both "/items/{id}" (bare, defaults to Overview)
// and "/items/{id}/{tab}" (evidence, listing, packaging, build-log) hit
// this one route -- ItemDetailView itself derives the active tab from
// the URL (see tabBasePath) and pushes new tab segments as the user
// switches tabs, so the actual tab param here is never read.
export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id } = await params;
  return <ItemDetailView itemId={id} tabBasePath={`/items/${id}`} />;
}
