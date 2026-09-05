import { ItemDetailView } from '@/components/item-detail/item-detail-view';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ItemDetailView itemId={id} />;
}
