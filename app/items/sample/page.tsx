import type { Metadata } from 'next';

import { displayTitle } from '@/components/item-detail/format';
import { ItemDetailView } from '@/components/item-detail/item-detail-view';
import { buildSampleItemDetail, SAMPLE_ITEM_ID } from '@/server/items/sample-item-detail';

export const metadata: Metadata = {
  title: displayTitle(buildSampleItemDetail()),
};

export default function SampleItemDetailPage() {
  return <ItemDetailView itemId={SAMPLE_ITEM_ID} readOnly />;
}
