import { formatDistanceToNowStrict } from 'date-fns';

export function relativeTime(isoTimestamp: string): string {
  return formatDistanceToNowStrict(new Date(isoTimestamp), { addSuffix: true });
}

export function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
