'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { ActivityBadge } from '@/components/activity-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ItemDetail, ItemDetailRun } from '@/server/items/item-detail-repository';

type LoadStatus = 'loading' | 'ready' | 'error' | 'not-found';

const POLL_INTERVAL_MS = 8_000;

class ItemNotFoundError extends Error {}

async function requestItemDetail(itemId: string): Promise<ItemDetail> {
  const response = await fetch(`/api/items/${itemId}`);
  if (response.status === 404) throw new ItemNotFoundError();
  if (!response.ok) throw new Error('Could not load this item');
  return (await response.json()) as ItemDetail;
}

function relativeTime(isoTimestamp: string): string {
  return formatDistanceToNowStrict(new Date(isoTimestamp), {
    addSuffix: true,
  });
}

function humanizeField(field: string): string {
  const key = field.includes('.') ? field.slice(field.indexOf('.') + 1) : field;
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatFactValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function ItemDetailView({ itemId }: { itemId: string }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    requestItemDetail(itemId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(error instanceof ItemNotFoundError ? 'not-found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      requestItemDetail(itemId)
        .then((data) => {
          setDetail(data);
          setStatus('ready');
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [itemId]);

  const reload = useCallback(() => {
    setStatus('loading');
    requestItemDetail(itemId)
      .then((data) => {
        setDetail(data);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        setStatus(error instanceof ItemNotFoundError ? 'not-found' : 'error');
      });
  }, [itemId]);

  const retry = useCallback(() => {
    setRetrying(true);
    fetch(`/api/items/${itemId}/retry`, { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error();
        return requestItemDetail(itemId);
      })
      .then((data) => {
        setDetail(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'))
      .finally(() => setRetrying(false));
  }, [itemId]);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[60px] max-w-[900px] items-center px-4 sm:px-7">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Today
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[900px] px-4 pb-20 pt-8 sm:px-7">
        {status === 'loading' && !detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : status === 'not-found' ? (
          <p className="text-sm text-muted-foreground">
            This item doesn&apos;t exist, or was removed.
          </p>
        ) : status === 'error' && !detail ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Could not load this item.
            </p>
            <Button variant="ghost" className="h-8 rounded-full px-3 text-xs" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : detail ? (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                  {displayTitle(detail)}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {detail.status} · updated {relativeTime(detail.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {detail.activity ? <ActivityBadge activity={detail.activity} /> : null}
                {detail.status === 'FAILED' ? (
                  <Button
                    variant="outline"
                    className="h-9 rounded-full px-4 text-xs"
                    onClick={retry}
                    disabled={retrying}
                  >
                    <RefreshCw
                      data-icon="inline-start"
                      className={cn(retrying && 'animate-spin')}
                    />
                    Retry
                  </Button>
                ) : null}
              </div>
            </section>

            {detail.photos.length > 0 ? (
              <section className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {detail.photos.map((photo) => (
                  <figure
                    key={photo.id}
                    className="aspect-square overflow-hidden rounded-2xl bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/items/${detail.id}/photos/${photo.id}`}
                      alt={photo.originalName}
                      className="h-full w-full object-cover"
                    />
                  </figure>
                ))}
              </section>
            ) : null}

            <section className="mt-6 rounded-[1.5rem] border border-border/75 bg-card p-5 sm:p-6">
              <h2 className="text-[17px] font-semibold tracking-[-0.03em]">
                Facts
              </h2>
              {detail.facts.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No facts recorded yet.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-border/70">
                  {detail.facts.map((fact) => (
                    <div key={fact.field} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">
                          {humanizeField(fact.field)}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {Math.round(fact.confidence * 100)}% confidence
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{formatFactValue(fact.value)}</p>
                      {fact.evidence ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fact.evidence}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {fact.origin} · {relativeTime(fact.retrievedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {detail.runs.length > 0 ? (
              <details className="group mt-6 rounded-[1.25rem] border border-border/60 bg-card/55 open:bg-card">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground group-open:text-foreground">
                  Build log · {detail.runs.length}{' '}
                  {detail.runs.length === 1 ? 'run' : 'runs'}
                </summary>
                <div className="space-y-2 px-4 pb-4 sm:px-6 sm:pb-6">
                  {detail.runs.map((run) => (
                    <RunLogEntry key={run.id} run={run} />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function displayTitle(detail: ItemDetail): string {
  const manufacturer = findFact(detail, 'identity.manufacturer');
  const model = findFact(detail, 'identity.model');
  const itemType = findFact(detail, 'identity.item_type');
  if (manufacturer && model) return `${manufacturer} ${model}`;
  if (manufacturer && itemType) return `${manufacturer} ${itemType}`;
  return model ?? itemType ?? 'Unidentified item';
}

function findFact(detail: ItemDetail, field: string): string | undefined {
  const fact = detail.facts.find((candidate) => candidate.field === field);
  return typeof fact?.value === 'string' ? fact.value : undefined;
}

function RunLogEntry({ run }: { run: ItemDetailRun }) {
  const durationMs =
    new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  return (
    <details className="group rounded-xl border border-border/60 px-3 py-2.5 open:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Badge
            variant={run.outcome === 'succeeded' ? 'secondary' : 'destructive'}
            className={cn(
              'border-transparent',
              run.outcome === 'succeeded' && 'bg-success-soft text-success',
            )}
          >
            {run.outcome === 'succeeded' ? 'Succeeded' : 'Failed'}
          </Badge>
          Attempt {run.attempt}
        </span>
        <span className="text-xs text-muted-foreground">
          {run.model} · {(durationMs / 1000).toFixed(1)}s ·{' '}
          {relativeTime(run.startedAt)}
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-xs">
        {run.inputTokens !== undefined || run.outputTokens !== undefined ? (
          <p className="text-muted-foreground">
            {run.inputTokens ?? 0} input tokens · {run.outputTokens ?? 0} output
            tokens
          </p>
        ) : null}
        {run.errorMessage ? (
          <pre className="overflow-x-auto rounded-lg bg-destructive/5 p-3 text-destructive">
            {run.errorMessage}
          </pre>
        ) : null}
        {run.response !== undefined ? (
          <pre className="overflow-x-auto rounded-lg bg-muted p-3">
            {JSON.stringify(run.response, null, 2)}
          </pre>
        ) : null}
      </div>
    </details>
  );
}
