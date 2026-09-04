import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ActivityState } from '@/server/items/homepage-snapshot';

const ACTIVITY_BADGE: Record<ActivityState, { label: string; className?: string }> = {
  working: {
    label: 'Working',
    className: 'border-transparent bg-primary/10 text-primary',
  },
  waiting: { label: 'Waiting' },
  paused: {
    label: 'Paused',
    className: 'border-transparent bg-warning-soft text-warning',
  },
  errored: {
    label: 'Errored',
    className: 'border-transparent bg-destructive/10 text-destructive',
  },
};

export function ActivityBadge({ activity }: { activity: ActivityState }) {
  const { label, className } = ACTIVITY_BADGE[activity];
  return (
    <Badge variant="secondary" className={cn('shrink-0', className)}>
      {label}
    </Badge>
  );
}
