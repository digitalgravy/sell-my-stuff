import { cn } from '@/lib/utils';
import type { PhaseInfo } from '@/server/items/item-detail-repository';

/**
 * Identified → Assessed → Researched → Draft ready, per PhaseInfo (see
 * server/items/item-detail-view-model.ts's derivePhases). Shared between
 * the item detail page header (the full variant, with labels) and the
 * Items list table (the compact variant, segments only) so both surfaces
 * agree on what "in progress" looks like.
 */
export function PhaseStrip({ phases }: { phases: PhaseInfo[] }) {
  return (
    <ol className="mt-7 flex items-stretch gap-3">
      {phases.map((phase) => (
        <li key={phase.key} className="flex-1">
          <div
            className={cn(
              'h-1.5 rounded-full',
              phase.state === 'done' && 'bg-primary',
              phase.state === 'pending' && 'bg-warning',
              phase.state === 'not_started' && 'bg-muted',
            )}
          />
          <p
            className={cn(
              'mt-2.5 text-sm font-semibold',
              phase.state === 'not_started' && 'text-muted-foreground',
            )}
          >
            {phase.label}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{phase.detail}</p>
        </li>
      ))}
    </ol>
  );
}

/** Segments only, with the current stage's label underneath -- for a table row, not a page header. */
export function CompactPhaseStrip({ phases }: { phases: PhaseInfo[] }) {
  const current = [...phases].reverse().find((phase) => phase.state !== 'not_started');
  return (
    <div className="w-28" title={phases.map((phase) => `${phase.label}: ${phase.state}`).join(' · ')}>
      <div className="flex items-stretch gap-1">
        {phases.map((phase) => (
          <div
            key={phase.key}
            className={cn(
              'h-1 flex-1 rounded-full',
              phase.state === 'done' && 'bg-primary',
              phase.state === 'pending' && 'bg-warning',
              phase.state === 'not_started' && 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{current?.label ?? phases[0]?.label}</p>
    </div>
  );
}
