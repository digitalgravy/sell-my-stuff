'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  Check,
  Circle,
  CircleAlert,
  ImagePlus,
  MoreVertical,
  RefreshCw,
  Trash2,
} from 'lucide-react';

import { ActivityBadge } from '@/components/activity-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PhaseStrip } from '@/components/phase-strip';
import { getEnumFactField } from '@/lib/fact-fields';
import { cn } from '@/lib/utils';
import { EBAY_UK_PRIVATE_SELLER_FEE_NOTE } from '@/server/items/fees';
import type {
  AttentionTask,
  ItemDetail,
  ItemDetailFact,
} from '@/server/items/item-detail-repository';

import { BuildLog } from './build-log';
import {
  displayTitle,
  formatFactValue,
  humanizeField,
  relativeTime,
  statusLabel,
} from './format';
import {
  ResolveFactsDialog,
  type FactAnswerSubmission,
  type OpenQuestionForDialog,
} from './resolve-facts-dialog';

type LoadStatus = 'loading' | 'ready' | 'error' | 'not-found';

const POLL_INTERVAL_MS = 8_000;
const FACTS_SECTION_ID = 'facts-section';
// Mirrors the server's own identification/condition confidence gate
// (inspect-images-job.ts) -- a fact below this is exactly the kind that
// would have raised a question rather than being asserted outright, so it's
// the right line for "worth a second look" here too.
const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** The identity.open_questions/condition.open_questions facts are a JSON string array, not tied to any single field -- pulled out into one row per question for the resolve-facts modal. */
function extractOpenQuestions(
  facts: ItemDetailFact[] | undefined,
  field: string,
  source: OpenQuestionForDialog['source'],
): OpenQuestionForDialog[] {
  const value = facts?.find((fact) => fact.field === field)?.value;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string').map((text) => ({ source, text }));
}

class ItemNotFoundError extends Error {}

async function requestItemDetail(apiBase: string): Promise<ItemDetail> {
  const response = await fetch(apiBase);
  if (response.status === 404) throw new ItemNotFoundError();
  if (!response.ok) throw new Error('Could not load this item');
  return (await response.json()) as ItemDetail;
}

function upsertFact(
  facts: ItemDetailFact[],
  field: string,
  value: string,
): ItemDetailFact[] {
  const index = facts.findIndex((fact) => fact.field === field);
  const updated: ItemDetailFact = {
    field,
    value,
    confidence: 1,
    origin: 'user_confirmed',
    evidence: index >= 0 ? facts[index]!.evidence : undefined,
    retrievedAt: new Date().toISOString(),
  };
  if (index < 0) return [...facts, updated];
  const next = [...facts];
  next[index] = updated;
  return next;
}

interface Correcting {
  field: string;
  label: string;
}

export function ItemDetailView({
  itemId,
  readOnly = false,
}: {
  itemId: string;
  readOnly?: boolean;
}) {
  const apiBase = `/api/items/${itemId}`;
  const router = useRouter();

  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [retrying, setRetrying] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [correcting, setCorrecting] = useState<Correcting | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [undoingEndpoint, setUndoingEndpoint] = useState<string | null>(null);
  const [regeneratingResearch, setRegeneratingResearch] = useState(false);
  const [confirmingField, setConfirmingField] = useState<string | null>(null);
  const [resolveFactsOpen, setResolveFactsOpen] = useState(false);
  const [resolvingAnswers, setResolvingAnswers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    requestItemDetail(apiBase)
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
  }, [apiBase]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      requestItemDetail(apiBase)
        .then((data) => {
          setDetail(data);
          setStatus('ready');
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [apiBase]);

  const reload = useCallback(() => {
    setStatus('loading');
    requestItemDetail(apiBase)
      .then((data) => {
        setDetail(data);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        setStatus(error instanceof ItemNotFoundError ? 'not-found' : 'error');
      });
  }, [apiBase]);

  const retry = useCallback(() => {
    setRetrying(true);
    fetch(`${apiBase}/retry`, { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error();
        return requestItemDetail(apiBase);
      })
      .then((data) => {
        setDetail(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'))
      .finally(() => setRetrying(false));
  }, [apiBase]);

  const undoStep = useCallback(
    (endpoint: string) => {
      setUndoingEndpoint(endpoint);
      fetch(`${apiBase}/${endpoint}`, { method: 'DELETE' })
        .then((response) => {
          if (!response.ok) throw new Error();
          return requestItemDetail(apiBase);
        })
        .then((data) => {
          setDetail(data);
          setStatus('ready');
        })
        .catch(() => undefined)
        .finally(() => setUndoingEndpoint(null));
    },
    [apiBase],
  );

  const regenerateResearch = useCallback(() => {
    setRegeneratingResearch(true);
    fetch(`${apiBase}/research/regenerate`, { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error();
        return requestItemDetail(apiBase);
      })
      .then((data) => {
        setDetail(data);
        setStatus('ready');
      })
      .catch(() => undefined)
      .finally(() => setRegeneratingResearch(false));
  }, [apiBase]);

  const confirmDelete = useCallback(() => {
    setDeleting(true);
    fetch(apiBase, { method: 'DELETE' })
      .then((response) => {
        if (!response.ok) throw new Error();
        router.push('/');
      })
      .catch(() => setDeleting(false));
  }, [apiBase, router]);

  const openCorrection = useCallback(
    (field: string, label: string) => {
      if (!detail) return;
      const fact = detail.facts.find((candidate) => candidate.field === field);
      setDraftValue(fact ? formatFactValue(fact.value) : '');
      setCorrecting({ field, label });
    },
    [detail],
  );

  const saveCorrection = useCallback(() => {
    if (!correcting || !detail) return;
    const { field } = correcting;

    if (readOnly) {
      setDetail({
        ...detail,
        facts: upsertFact(detail.facts, field, draftValue),
        attention: detail.attention.filter((task) => task.field !== field),
      });
      setCorrecting(null);
      return;
    }

    fetch(`${apiBase}/facts/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value: draftValue }),
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        return requestItemDetail(apiBase);
      })
      .then((data) => {
        setDetail(data);
        setStatus('ready');
      })
      .catch(() => undefined)
      .finally(() => setCorrecting(null));
  }, [apiBase, correcting, detail, draftValue, readOnly]);

  const confirmFact = useCallback(
    (field: string) => {
      if (!detail) return;

      if (readOnly) {
        setDetail({
          ...detail,
          facts: detail.facts.map((fact) =>
            fact.field === field ? { ...fact, confidence: 1, origin: 'user_confirmed' } : fact,
          ),
        });
        return;
      }

      setConfirmingField(field);
      fetch(`${apiBase}/facts/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      })
        .then((response) => {
          if (!response.ok) throw new Error();
          return requestItemDetail(apiBase);
        })
        .then((data) => {
          setDetail(data);
          setStatus('ready');
        })
        .catch(() => undefined)
        .finally(() => setConfirmingField(null));
    },
    [apiBase, detail, readOnly],
  );

  const resolveAnswers = useCallback(
    (answers: FactAnswerSubmission[]) => {
      if (readOnly) {
        setResolveFactsOpen(false);
        return;
      }
      setResolvingAnswers(true);
      fetch(`${apiBase}/facts/resolve-answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
        .then((response) => {
          if (!response.ok) throw new Error();
          return requestItemDetail(apiBase);
        })
        .then((data) => {
          setDetail(data);
          setStatus('ready');
          setResolveFactsOpen(false);
        })
        .catch(() => undefined)
        .finally(() => setResolvingAnswers(false));
    },
    [apiBase, readOnly],
  );

  const handleAttentionCta = useCallback(
    (task: AttentionTask) => {
      if (task.ctaLabel === 'Correct' && task.field) {
        openCorrection(task.field, task.title);
        return;
      }
      if (task.ctaLabel === 'Retry') {
        retry();
        return;
      }
      if (task.ctaLabel === 'Search eBay' && task.href) {
        window.open(task.href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (task.ctaLabel === 'Prepare eBay search') {
        regenerateResearch();
        return;
      }
      if (task.ctaLabel === 'Review facts' || task.ctaLabel === 'Add evidence') {
        setResolveFactsOpen(true);
      }
    },
    [openCorrection, retry, regenerateResearch],
  );

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[60px] max-w-[1100px] items-center justify-between px-4 sm:px-7">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back to today"
          >
            <ArrowLeft className="size-4" />
          </Link>
          {detail ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" className="rounded-full" />
                }
              >
                <MoreVertical />
                <span className="sr-only">Item actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled>
                  <ImagePlus />
                  Replace photos
                  <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={readOnly || detail.status === 'IDENTIFYING' || retrying}
                  onClick={retry}
                >
                  <RefreshCw className={cn(retrying && 'animate-spin')} />
                  Re-run identification
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={readOnly || regeneratingResearch || detail.status === 'NEEDS_INFORMATION'}
                  onClick={regenerateResearch}
                >
                  <RefreshCw className={cn(regeneratingResearch && 'animate-spin')} />
                  Regenerate eBay search
                  {detail.status === 'NEEDS_INFORMATION' ? (
                    <span className="ml-auto text-xs text-muted-foreground">Answer questions first</span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Archive />
                  Archive
                  <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={readOnly}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-4 pb-24 pt-8 sm:px-7">
        {status === 'loading' && !detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : status === 'not-found' ? (
          <p className="text-sm text-muted-foreground">
            This item doesn&apos;t exist, or was removed.
          </p>
        ) : status === 'error' && !detail ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Could not load this item.</p>
            <Button variant="ghost" size="sm" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : detail ? (
          <>
            <section className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                  {displayTitle(detail)}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {statusLabel(detail.status)} · updated {relativeTime(detail.updatedAt)}
                </p>
              </div>
              {detail.activity ? <ActivityBadge activity={detail.activity} /> : null}
            </section>

            <PhaseStrip phases={detail.phases} />

            <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_360px]">
              <PhotoGallery
                photos={detail.photos}
                activePhoto={activePhoto}
                onSelect={setActivePhoto}
              />
              <DecisionCard
                detail={detail}
                onAttentionCta={handleAttentionCta}
                onJumpToTab={setActiveTab}
              />
            </section>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(String(value))}
              className="mt-8"
            >
              <div className="sticky top-[60px] z-20 -mx-4 flex justify-center border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-2xl sm:-mx-7 sm:px-7">
                <TabsList className="rounded-full">
                  <TabsTrigger value="overview" className="rounded-full">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="listing" className="rounded-full">
                    Listing
                  </TabsTrigger>
                  <TabsTrigger value="evidence" className="rounded-full">
                    Evidence
                  </TabsTrigger>
                  <TabsTrigger value="build-log" className="rounded-full">
                    Build log
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="mt-6">
                <OverviewTab
                  detail={detail}
                  onAttentionCta={handleAttentionCta}
                  onCorrectFact={openCorrection}
                  onConfirmFact={confirmFact}
                  confirmingField={confirmingField}
                />
              </TabsContent>
              <TabsContent value="listing" className="mt-6">
                <ListingTab detail={detail} />
              </TabsContent>
              <TabsContent value="evidence" className="mt-6">
                <EvidenceTab detail={detail} itemId={itemId} readOnly={readOnly} onImported={reload} />
              </TabsContent>
              <TabsContent value="build-log" className="mt-6">
                <section className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-[-0.03em]">
                      Build log
                    </h2>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {detail.buildSteps.length} step
                      {detail.buildSteps.length === 1 ? '' : 's'} ·{' '}
                      {detail.buildSteps.filter((step) => step.outcome === 'succeeded').length}{' '}
                      succeeded · ~${detail.aiCostUsd.toFixed(2)} in AI calls
                    </p>
                  </div>
                  <div className="mt-5">
                    <BuildLog
                      steps={detail.buildSteps}
                      readOnly={readOnly}
                      undoingEndpoint={undoingEndpoint}
                      onUndo={undoStep}
                    />
                  </div>
                </section>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the item, its photos, facts and build log. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={correcting !== null}
        onOpenChange={(open) => {
          if (!open) setCorrecting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change &ldquo;{correcting?.label}&rdquo;</DialogTitle>
            <DialogDescription>
              This becomes the authoritative value — it overrides whatever the pipeline
              inferred.
            </DialogDescription>
          </DialogHeader>
          {correcting && getEnumFactField(correcting.field) ? (
            <Select value={draftValue} onValueChange={(value) => setDraftValue(value ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {getEnumFactField(correcting.field)!.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Textarea
              rows={4}
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
            />
          )}
          <DialogFooter>
            <Button onClick={saveCorrection} disabled={draftValue.trim().length === 0}>
              Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResolveFactsDialog
        open={resolveFactsOpen}
        onOpenChange={setResolveFactsOpen}
        facts={(detail?.facts ?? []).filter((fact) => fact.confidence < LOW_CONFIDENCE_THRESHOLD)}
        openQuestions={[
          ...extractOpenQuestions(detail?.facts, 'identity.open_questions', 'identity'),
          ...extractOpenQuestions(detail?.facts, 'condition.open_questions', 'condition'),
        ]}
        onSubmit={resolveAnswers}
        submitting={resolvingAnswers}
      />
    </main>
  );
}

function PhotoGallery({
  photos,
  activePhoto,
  onSelect,
}: {
  photos: ItemDetail['photos'];
  activePhoto: number;
  onSelect: (index: number) => void;
}) {
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-[1.75rem] border border-dashed border-border/75 bg-muted/40 text-sm text-muted-foreground">
        No photos yet
      </div>
    );
  }

  const selected = photos[Math.min(activePhoto, photos.length - 1)]!;

  return (
    <div>
      <figure className="aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selected.url}
          alt={selected.label}
          className="h-full w-full object-cover"
        />
      </figure>
      {photos.length > 1 ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onSelect(index)}
              className={cn(
                'aspect-square w-20 shrink-0 overflow-hidden rounded-2xl ring-2 ring-transparent transition',
                index === activePhoto ? 'ring-primary' : 'opacity-70 hover:opacity-100',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.label} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DecisionCard({
  detail,
  onAttentionCta,
  onJumpToTab,
}: {
  detail: ItemDetail;
  onAttentionCta: (task: AttentionTask) => void;
  onJumpToTab: (tab: string) => void;
}) {
  if (!detail.pricing) {
    // pricing is undefined only when there's no usable evidence -- if
    // `evidence` exists at all in that case, every comparable sale on the
    // item must be excluded (computeValuation filters those out and only
    // returns undefined when nothing usable remains). Say which one is
    // actually true rather than a blanket "not built yet".
    const allExcluded = Boolean(detail.evidence);
    return (
      <div className="flex flex-col justify-center rounded-[1.75rem] border border-dashed border-border/75 bg-muted/30 p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">No price yet</p>
        <p className="mt-2">
          {allExcluded
            ? 'Every comparable sale on this item is currently excluded — include at least one to get a price.'
            : 'No comparable sales have been imported yet — this will show a real suggested price the moment some are.'}
        </p>
        <Button
          variant="outline"
          className="mt-4 self-start"
          onClick={() => onJumpToTab('evidence')}
        >
          Go to Evidence
        </Button>
      </div>
    );
  }

  const { pricing } = detail;
  const required = detail.attention.filter((task) => task.required);
  const optional = detail.attention.filter((task) => !task.required);
  const ready = required.length === 0;

  const confidenceBadgeClass =
    pricing.confidence === 'high'
      ? 'bg-success-soft text-success'
      : pricing.confidence === 'medium'
        ? 'bg-warning-soft text-warning'
        : 'bg-muted text-muted-foreground';

  return (
    <div className="rounded-[1.75rem] border border-border/75 bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Recommended Buy-It-Now price
          </p>
          <p className="mt-1.5 font-display text-4xl font-semibold tracking-[-0.03em] tabular-nums">
            £{pricing.buyItNowPrice.toFixed(2)}
          </p>
        </div>
        <Badge className={cn('shrink-0 border-transparent capitalize', confidenceBadgeClass)}>
          {pricing.confidence} confidence
        </Badge>
      </div>
      <p className="mt-2.5 text-sm text-muted-foreground">
        Likely achieved £{pricing.likelyAchievedLow.toFixed(2)}–£
        {pricing.likelyAchievedHigh.toFixed(2)} · {pricing.evidenceCount} comparable sale
        {pricing.evidenceCount === 1 ? '' : 's'}
        {pricing.evidenceWindowDays
          ? ` in the last ${pricing.evidenceWindowDays} days`
          : ''}
      </p>
      {detail.proceeds ? (
        <details className="mt-2 text-sm text-muted-foreground">
          <summary className="cursor-pointer list-none marker:hidden">
            Estimated net proceeds:{' '}
            <span className="font-semibold tabular-nums text-foreground">
              £{detail.proceeds.estimatedNet.toFixed(2)}
            </span>
          </summary>
          <div className="mt-2 space-y-1 border-l border-border/60 pl-3 text-xs tabular-nums">
            <p>Sale proceeds: £{detail.proceeds.saleProceeds.toFixed(2)}</p>
            <p>− Marketplace fee: £{detail.proceeds.marketplaceFeeGbp.toFixed(2)}</p>
            <p>− AI research cost: £{detail.proceeds.aiResearchCostGbp.toFixed(2)}</p>
            <p className="font-medium text-foreground">
              = Estimated net: £{detail.proceeds.estimatedNet.toFixed(2)}
            </p>
            <p className="pt-1 text-muted-foreground/80">{EBAY_UK_PRIVATE_SELLER_FEE_NOTE}</p>
          </div>
        </details>
      ) : null}

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-xs text-muted-foreground">Accept offers</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            £{pricing.acceptOffersLow.toFixed(2)}–£{pricing.acceptOffersHigh.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-xs text-muted-foreground">Quick sale</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            £{pricing.quickSalePrice.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-xs text-muted-foreground">Auto-decline below</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            £{pricing.autoDeclineBelow.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mt-6 border-t border-border/60 pt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {ready ? 'Ready to list' : 'Almost ready to list'}
          </p>
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              ready ? 'text-success' : 'text-warning',
            )}
          >
            <span
              className={cn('size-1.5 rounded-full', ready ? 'bg-success' : 'bg-warning')}
            />
            {ready
              ? 'All clear'
              : `${required.length} check${required.length === 1 ? '' : 's'} required`}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {ready ? 'All required checks are complete.' : required[0]!.note}
        </p>

        {required.length > 0 || optional.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
            {required.map((task) => (
              <p key={task.id} className="flex items-center gap-2 text-sm text-warning">
                <CircleAlert className="size-4 shrink-0" />
                {task.title}
              </p>
            ))}
            {optional.length > 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Circle className="size-4 shrink-0" />
                {optional.length} optional detail{optional.length === 1 ? '' : 's'} could
                strengthen the listing
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2.5">
          {required.length > 0 ? (
            <Button onClick={() => onAttentionCta(required[0]!)}>
              {required[0]!.ctaLabel}
            </Button>
          ) : null}
          <Button
            variant={required.length > 0 ? 'outline' : 'default'}
            disabled={!detail.listing}
            onClick={() => onJumpToTab('listing')}
          >
            Review draft listing
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  detail,
  onAttentionCta,
  onCorrectFact,
  onConfirmFact,
  confirmingField,
}: {
  detail: ItemDetail;
  onAttentionCta: (task: AttentionTask) => void;
  onCorrectFact: (field: string, label: string) => void;
  onConfirmFact: (field: string) => void;
  confirmingField: string | null;
}) {
  const required = detail.attention.filter((task) => task.required);
  const optional = detail.attention.filter((task) => !task.required);

  return (
    <div className="space-y-7">
      <section className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-[-0.03em]">
          Needs your attention
        </h2>
        {required.length === 0 && optional.length === 0 ? (
          <p className="mt-3.5 text-sm text-muted-foreground">
            Nothing needs your attention right now.
          </p>
        ) : (
          <div className="mt-5 space-y-6">
            {required.length > 0 ? (
              <AttentionGroup
                label="Required"
                tasks={required}
                onCta={onAttentionCta}
              />
            ) : null}
            {optional.length > 0 ? (
              <AttentionGroup
                label="Optional"
                tasks={optional}
                onCta={onAttentionCta}
              />
            ) : null}
          </div>
        )}
      </section>

      <div id={FACTS_SECTION_ID} className="space-y-7 scroll-mt-20">
        {detail.facts.length === 0 ? (
          <section className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Facts</h2>
            <p className="mt-3.5 text-sm text-muted-foreground">No facts recorded yet.</p>
          </section>
        ) : (
          groupFacts(detail.facts).map((group) => {
            const lowConfidenceCount = group.facts.filter(
              (fact) => fact.confidence < LOW_CONFIDENCE_THRESHOLD,
            ).length;
            return (
              <section
                key={group.key}
                className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-[-0.03em]">
                    {group.label}
                  </h2>
                  <div className="flex items-center gap-2.5">
                    {lowConfidenceCount > 0 ? (
                      <Badge className="border-transparent bg-warning-soft text-warning">
                        {lowConfidenceCount} low confidence
                      </Badge>
                    ) : null}
                    <span className="text-sm text-muted-foreground">
                      {group.facts.length} fact{group.facts.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <FactGrid
                  facts={group.facts}
                  onCorrectFact={onCorrectFact}
                  onConfirmFact={onConfirmFact}
                  confirmingField={confirmingField}
                />
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

const FACT_GROUP_LABEL: Record<string, string> = {
  identity: 'Item details',
  condition: 'Condition and testing',
};

function groupFacts(
  facts: ItemDetailFact[],
): { key: string; label: string; facts: ItemDetailFact[] }[] {
  const order: string[] = [];
  const byKey = new Map<string, ItemDetailFact[]>();
  for (const fact of facts) {
    const key = fact.field.includes('.') ? fact.field.slice(0, fact.field.indexOf('.')) : 'other';
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(fact);
  }
  return order.map((key) => ({
    key,
    label: FACT_GROUP_LABEL[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1)}`,
    facts: byKey.get(key)!,
  }));
}

function FactGrid({
  facts,
  onCorrectFact,
  onConfirmFact,
  confirmingField,
}: {
  facts: ItemDetailFact[];
  onCorrectFact: (field: string, label: string) => void;
  onConfirmFact: (field: string) => void;
  confirmingField: string | null;
}) {
  const rows: ItemDetailFact[][] = [];
  for (let i = 0; i < facts.length; i += 2) rows.push(facts.slice(i, i + 2));

  return (
    <div className="mt-4 divide-y divide-border/70">
      {rows.map((row) => (
        <div
          key={row[0]!.field}
          className="grid grid-cols-1 gap-x-8 gap-y-5 py-5 sm:grid-cols-2"
        >
          {row.map((fact) => (
            <FactCell
              key={fact.field}
              fact={fact}
              onCorrectFact={onCorrectFact}
              onConfirmFact={onConfirmFact}
              confirming={confirmingField === fact.field}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function FactCell({
  fact,
  onCorrectFact,
  onConfirmFact,
  confirming,
}: {
  fact: ItemDetailFact;
  onCorrectFact: (field: string, label: string) => void;
  onConfirmFact: (field: string) => void;
  confirming: boolean;
}) {
  const alreadyConfirmed = fact.origin === 'user_confirmed';
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">{humanizeField(fact.field)}</p>
        <div className="-my-1 flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded-md px-1 py-1 text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            disabled={alreadyConfirmed || confirming}
            onClick={() => onConfirmFact(fact.field)}
          >
            {confirming ? 'Confirming…' : 'Confirm'}
          </button>
          <span className="text-muted-foreground/50">·</span>
          <button
            type="button"
            className="rounded-md px-1 py-1 text-sm font-medium text-primary hover:underline"
            onClick={() => onCorrectFact(fact.field, humanizeField(fact.field))}
          >
            Change
          </button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="text-[15px] font-semibold">{formatFactValue(fact.value)}</p>
        {fact.confidence < LOW_CONFIDENCE_THRESHOLD ? (
          <Badge className="border-transparent bg-warning-soft text-warning">
            Low confidence
          </Badge>
        ) : null}
      </div>
      {fact.evidence ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{fact.evidence}</p>
      ) : null}
      <p className="mt-1.5 text-xs text-muted-foreground">
        {Math.round(fact.confidence * 100)}% confidence · {fact.origin} ·{' '}
        {relativeTime(fact.retrievedAt)}
      </p>
    </div>
  );
}

function AttentionGroup({
  label,
  tasks,
  onCta,
}: {
  label: string;
  tasks: AttentionTask[];
  onCta: (task: AttentionTask) => void;
}) {
  const actionable = (task: AttentionTask) =>
    (task.ctaLabel === 'Correct' && task.field !== undefined) ||
    task.ctaLabel === 'Retry' ||
    task.ctaLabel === 'Prepare eBay search' ||
    task.ctaLabel === 'Review facts' ||
    task.ctaLabel === 'Add evidence' ||
    (task.ctaLabel === 'Search eBay' && task.href !== undefined);

  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-3 space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              'rounded-2xl border p-5',
              task.required
                ? 'border-warning/40 bg-warning-soft/40'
                : 'border-border/60 bg-muted/30',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{task.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{task.note}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{task.impact}</p>
              </div>
              <Button
                variant={actionable(task) ? 'outline' : 'ghost'}
                size="sm"
                disabled={!actionable(task)}
                className="shrink-0"
                onClick={() => onCta(task)}
              >
                {task.ctaLabel}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListingTab({ detail }: { detail: ItemDetail }) {
  if (!detail.listing) {
    return (
      <section className="rounded-[1.75rem] border border-dashed border-border/75 bg-muted/30 p-6 text-sm text-muted-foreground sm:p-8">
        <p className="font-medium text-foreground">Listing drafting not built yet</p>
        <p className="mt-2">
          Once a listing-drafting stage exists, the selling strategy, listing preview and
          publishing checks will show here.
        </p>
      </section>
    );
  }

  const { listing } = detail;
  const outstandingRequired = listing.checks.filter(
    (check) => check.state === 'required',
  ).length;

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.03em]">Draft listing</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The exact commercial proposal — nothing publishes until it&apos;s approved.
        </p>
      </div>

      <section className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8">
        <h3 className="text-[15px] font-semibold">Selling strategy</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {listing.strategyOptions.map((option) => (
            <div
              key={option.name}
              className={cn(
                'rounded-2xl border p-5',
                option.recommended ? 'border-primary/50 bg-primary/5' : 'border-border/60',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{option.name}</p>
                {option.recommended ? (
                  <Badge className="border-transparent bg-primary/10 text-primary">
                    Recommended
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm tabular-nums">{option.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{option.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8">
          <h3 className="text-[15px] font-semibold">Listing preview</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{listing.marketplace}</p>
          <p className="mt-4 text-sm font-semibold">{listing.title}</p>
          <p className="mt-2.5 text-sm whitespace-pre-line text-muted-foreground">
            {listing.description}
          </p>
        </section>

        <section className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8">
          <h3 className="text-[15px] font-semibold">Publishing checks</h3>
          <div className="mt-4 space-y-3">
            {listing.checks.map((check) => (
              <div key={check.label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full',
                    check.state === 'yes' && 'bg-success-soft text-success',
                    check.state === 'required' && 'bg-warning-soft text-warning',
                    check.state === 'optional' && 'bg-muted text-muted-foreground',
                  )}
                >
                  {check.state === 'yes' ? <Check className="size-3.5" /> : null}
                </span>
                <span>{check.label}</span>
                {check.state !== 'yes' ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {check.state === 'required' ? 'Required' : 'Optional'}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {outstandingRequired > 0 ? (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning-soft/40 p-4 text-sm text-warning">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              Publish is on hold — {outstandingRequired} required check
              {outstandingRequired === 1 ? '' : 's'} outstanding.
            </div>
          ) : null}

          <div className="mt-5 space-y-2">
            <Button className="w-full" disabled>
              Approve and publish
            </Button>
            <Button variant="outline" className="w-full" disabled>
              Approve and schedule
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Publishing isn&apos;t built yet.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

// eBay condition text ("Brand new") should read as one line; a hyphenated
// clause ("Opened - never used") is fine to wrap at the hyphen's spaces.
function keepOnOneLineUnlessHyphenated(text: string): string {
  return text.includes('-') ? text : text.replace(/ /g, '\u00A0');
}

function EvidenceTab({
  detail,
  itemId,
  readOnly,
  onImported,
}: {
  detail: ItemDetail;
  itemId: string;
  readOnly: boolean;
  onImported: () => void;
}) {
  const [togglingSaleId, setTogglingSaleId] = useState<string | null>(null);
  const [reclassifying, setReclassifying] = useState(false);

  const reclassifyEvidence = useCallback(() => {
    setReclassifying(true);
    fetch(`/api/items/${itemId}/evidence/reclassify`, { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error();
        onImported();
      })
      .catch(() => undefined)
      .finally(() => setReclassifying(false));
  }, [itemId, onImported]);

  const toggleSale = useCallback(
    (saleId: string, excluded: boolean) => {
      setTogglingSaleId(saleId);
      fetch(`/api/items/${itemId}/evidence/${saleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded }),
      })
        .then((response) => {
          if (!response.ok) throw new Error();
          onImported();
        })
        .catch(() => undefined)
        .finally(() => setTogglingSaleId(null));
    },
    [itemId, onImported],
  );

  if (!detail.evidence) {
    return (
      <div className="space-y-5">
        <section className="rounded-[1.75rem] border border-dashed border-border/75 bg-muted/30 p-6 text-sm text-muted-foreground sm:p-8">
          <p className="font-medium text-foreground">No comparable sales imported yet</p>
          <p className="mt-2">
            Import a captured eBay search page below, or use the{' '}
            <Link href="/tools/capture" className="underline underline-offset-2">
              capture bookmarklet
            </Link>{' '}
            to save one.
          </p>
        </section>
        <CaptureImportPanel itemId={itemId} readOnly={readOnly} onImported={onImported} />
      </div>
    );
  }

  const { evidence } = detail;
  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">Comparable sales</h2>
          <p className="text-sm tabular-nums text-muted-foreground">
            Fair value £{evidence.fairValue.toFixed(2)}
          </p>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{evidence.note}</p>
          {!readOnly ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={reclassifying}
              onClick={reclassifyEvidence}
            >
              {reclassifying ? 'Re-checking…' : 'Re-check matches'}
            </Button>
          ) : null}
        </div>
        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44px]">
                  <span className="sr-only">Include in pricing</span>
                </TableHead>
                <TableHead className="w-full min-w-[220px]">Listing</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Sold</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evidence.sales.map((sale) => (
                <TableRow
                  key={sale.id ?? sale.title}
                  className={cn(sale.excluded && 'text-muted-foreground')}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={!sale.excluded}
                      disabled={readOnly || !sale.id || togglingSaleId === sale.id}
                      onChange={(event) =>
                        sale.id && toggleSale(sale.id, !event.target.checked)
                      }
                      aria-label={sale.excluded ? 'Include in pricing' : 'Exclude from pricing'}
                      className="size-4 accent-primary"
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal break-words">
                    <span className={cn(sale.excluded && 'line-through')}>{sale.title}</span>
                    {sale.excluded && sale.excludedReason ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {sale.excludedReason}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs">
                    {keepOnOneLineUnlessHyphenated(sale.match)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums">
                    {sale.soldAt}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    £{sale.price.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <CaptureImportPanel itemId={itemId} readOnly={readOnly} onImported={onImported} />
    </div>
  );
}

interface PendingCapture {
  id: string;
  sourceUrl: string | null;
  pageTitle: string | null;
  createdAt: string;
  extractedCount: number;
}

function CaptureImportPanel({
  itemId,
  readOnly,
  onImported,
}: {
  itemId: string;
  readOnly: boolean;
  onImported: () => void;
}) {
  const [captures, setCaptures] = useState<PendingCapture[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCaptures = useCallback(() => {
    fetch('/api/research/captures')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data: { captures: PendingCapture[] }) => setCaptures(data.captures))
      .catch(() => setCaptures([]));
  }, []);

  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  const importCapture = useCallback(
    (captureId: string) => {
      setBusyId(captureId);
      fetch(`/api/items/${itemId}/research/captures/${captureId}/import`, { method: 'POST' })
        .then((response) => {
          if (!response.ok) throw new Error();
          loadCaptures();
          onImported();
        })
        .catch(() => undefined)
        .finally(() => setBusyId(null));
    },
    [itemId, loadCaptures, onImported],
  );

  const discardCapture = useCallback(
    (captureId: string) => {
      setBusyId(captureId);
      fetch(`/api/research/captures/${captureId}`, { method: 'DELETE' })
        .then(() => loadCaptures())
        .catch(() => undefined)
        .finally(() => setBusyId(null));
    },
    [loadCaptures],
  );

  if (readOnly || captures === null) return null;

  return (
    <section className="rounded-[1.75rem] border border-border/75 bg-card p-6 sm:p-8">
      <h3 className="text-sm font-semibold tracking-[-0.02em]">Pending captured pages</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Captured with the bookmarklet from your own browser — pick one to import its comparable
        sales onto this item.
      </p>
      {captures.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing waiting yet — use the{' '}
          <Link href="/tools/capture" className="underline underline-offset-2">
            capture bookmarklet
          </Link>{' '}
          on an eBay search page, then come back here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {captures.map((capture) => (
            <li
              key={capture.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 p-3 sm:p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {capture.pageTitle ?? capture.sourceUrl ?? 'Captured page'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {relativeTime(capture.createdAt)} ·{' '}
                  {capture.extractedCount === 0
                    ? 'no sales found'
                    : `${capture.extractedCount} sale${capture.extractedCount === 1 ? '' : 's'} found`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === capture.id}
                  onClick={() => discardCapture(capture.id)}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  disabled={busyId === capture.id || capture.extractedCount === 0}
                  onClick={() => importCapture(capture.id)}
                >
                  Import
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
