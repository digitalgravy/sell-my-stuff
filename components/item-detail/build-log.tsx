import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BuildStep, BuildStepType } from '@/server/items/item-detail-repository';

const TYPE_BADGE: Record<BuildStepType, { label: string; className: string }> = {
  llm: { label: 'LLM', className: 'bg-primary/10 text-primary' },
  tool: { label: 'TOOL', className: 'bg-accent-strong/10 text-accent-strong' },
  compute: { label: 'COMPUTE', className: 'bg-warning-soft text-warning' },
  policy: { label: 'POLICY', className: 'bg-success-soft text-success' },
};

export function BuildLog({ steps }: { steps: BuildStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has run for this item yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <BuildStepEntry key={step.id} step={step} index={index} />
      ))}
    </div>
  );
}

function BuildStepEntry({ step, index }: { step: BuildStep; index: number }) {
  const badge = TYPE_BADGE[step.type];
  return (
    <details className="group rounded-2xl border border-border/60 px-5 py-4 open:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <Badge className={cn('border-transparent', badge.className)}>
            {badge.label}
          </Badge>
          <span className="truncate font-medium">{step.stage}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground">
          <Badge
            variant={step.outcome === 'succeeded' ? 'secondary' : 'destructive'}
            className={cn(
              'border-transparent',
              step.outcome === 'succeeded' && 'bg-success-soft text-success',
            )}
          >
            {step.outcome === 'succeeded' ? 'Succeeded' : 'Failed'}
          </Badge>
          {(step.durationMs / 1000).toFixed(1)}s
        </span>
      </summary>
      <div className="mt-3 pl-[2.4rem]">
        <p className="text-sm text-muted-foreground">{step.detail}</p>
        <div className="mt-4 space-y-3 text-sm">
          {step.blocks.map((block, blockIndex) => (
            <div key={blockIndex} className="rounded-xl border border-border/50">
              <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5">
                <span className="font-medium">{block.label}</span>
                {block.meta ? (
                  <span className="text-xs text-muted-foreground">{block.meta}</span>
                ) : null}
              </div>
              <pre className="overflow-x-auto p-4 text-xs whitespace-pre-wrap text-muted-foreground">
                {block.content}
              </pre>
            </div>
          ))}
          {step.artifacts && step.artifacts.length > 0 ? (
            <p className="text-muted-foreground">
              Artifacts: {step.artifacts.join(', ')}
            </p>
          ) : null}
        </div>
      </div>
    </details>
  );
}
