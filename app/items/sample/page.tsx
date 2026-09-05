import { ItemDetailView } from '@/components/item-detail/item-detail-view';
import { SAMPLE_ITEM_ID } from '@/server/items/sample-item-detail';

export default function SampleItemDetailPage() {
  return <ItemDetailView itemId={SAMPLE_ITEM_ID} readOnly />;
}
