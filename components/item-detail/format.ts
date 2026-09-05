import { formatDistanceToNowStrict } from 'date-fns';

import type { ItemDetail } from '@/server/items/item-detail-repository';

export function relativeTime(isoTimestamp: string): string {
  return formatDistanceToNowStrict(new Date(isoTimestamp), {
    addSuffix: true,
  });
}

export function humanizeField(field: string): string {
  const key = field.includes('.') ? field.slice(field.indexOf('.') + 1) : field;
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatFactValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function displayTitle(detail: ItemDetail): string {
  const manufacturer = findFact(detail, 'identity.manufacturer');
  const model = findFact(detail, 'identity.model');
  const itemType = findFact(detail, 'identity.item_type');
  if (manufacturer && model) return `${manufacturer} ${model}`;
  if (manufacturer && itemType) return `${manufacturer} ${itemType}`;
  return model ?? itemType ?? 'Unidentified item';
}

export function findFact(detail: ItemDetail, field: string): string | undefined {
  const fact = detail.facts.find((candidate) => candidate.field === field);
  return typeof fact?.value === 'string' ? fact.value : undefined;
}

const STATUS_LABEL: Partial<Record<ItemDetail['status'], string>> = {
  INBOX: 'Queued for identification',
  IDENTIFYING: 'Identifying',
  NEEDS_INFORMATION: 'Needs your input',
  RESEARCHING: 'Researching',
  VALUING: 'Valuing',
  READY_FOR_REVIEW: 'Ready for your review',
  FAILED: 'Failed',
};

export function statusLabel(status: ItemDetail['status']): string {
  return STATUS_LABEL[status] ?? status;
}
