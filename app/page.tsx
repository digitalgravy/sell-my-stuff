'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  Camera,
  Check,
  ChevronRight,
  Clock3,
  CircleHelp,
  ImagePlus,
  LoaderCircle,
  Menu,
  PackageCheck,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { ActivityBadge } from '@/components/activity-badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isSupportedImage } from '@/lib/capture-policy';
import type {
  AttentionItem,
  HomepageStats,
  WorkingItem,
} from '@/server/items/homepage-snapshot';

type Photo = { id: string; name: string; url: string; file: File };
type HomepageStatus = 'loading' | 'ready' | 'error';
type HomepageSnapshot = {
  attention: AttentionItem[];
  working: WorkingItem[];
  stats: HomepageStats;
};

const EMPTY_STATS: HomepageStats = {
  ready: 0,
  inProgress: 0,
  live: 0,
  cleared: 0,
  realisedTotal: 0,
  estimatedValueTotal: 0,
};

function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function relativeTime(isoTimestamp: string): string {
  return formatDistanceToNowStrict(new Date(isoTimestamp), {
    addSuffix: true,
  });
}

const HOMEPAGE_POLL_INTERVAL_MS = 8_000;

async function requestHomepageSnapshot(): Promise<HomepageSnapshot> {
  const response = await fetch('/api/items/homepage');
  if (!response.ok) throw new Error('Could not load current items');
  return (await response.json()) as HomepageSnapshot;
}

const today = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/London',
}).format(new Date());

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [working, setWorking] = useState<WorkingItem[]>([]);
  const [stats, setStats] = useState<HomepageStats>(EMPTY_STATS);
  const [homepageStatus, setHomepageStatus] =
    useState<HomepageStatus>('loading');

  const reloadHomepage = useCallback(() => {
    setHomepageStatus('loading');
    requestHomepageSnapshot()
      .then((data) => {
        setAttention(data.attention);
        setWorking(data.working);
        setStats(data.stats);
        setHomepageStatus('ready');
      })
      .catch(() => setHomepageStatus('error'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestHomepageSnapshot()
      .then((data) => {
        if (cancelled) return;
        setAttention(data.attention);
        setWorking(data.working);
        setStats(data.stats);
        setHomepageStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setHomepageStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Background work (identification, research) happens off-screen, so the
  // page needs to notice on its own rather than only on load/submit. Stays
  // quiet on failure -- a transient blip shouldn't flash an error over
  // already-visible, still-correct data.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      requestHomepageSnapshot()
        .then((data) => {
          setAttention(data.attention);
          setWorking(data.working);
          setStats(data.stats);
          setHomepageStatus('ready');
        })
        .catch(() => undefined);
    }, HOMEPAGE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = Array.from(files)
      .filter(isSupportedImage)
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        file,
      }));
    if (next.length) {
      setPhotos((current) => [...current, ...next]);
      setSubmitted(false);
      setUploadError(undefined);
    }
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    },
    [],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (event.clipboardData?.files.length)
        addFiles(event.clipboardData.files);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFiles]);

  useEffect(() => {
    const modelContext = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Record<string, unknown>,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!modelContext?.registerTool) return;

    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: 'start_photo_intake',
          title: 'Start photo intake',
          description:
            'Open the visible photo chooser so the user can add photographs of an item to sell.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: () => {
            inputRef.current?.click();
            return { status: 'waiting_for_photos' };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  const removePhoto = (photo: Photo) => {
    URL.revokeObjectURL(photo.url);
    setPhotos((current) =>
      current.filter((candidate) => candidate.id !== photo.id),
    );
    setUploadError(undefined);
  };

  const resetCapture = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setSubmitted(false);
    setUploadError(undefined);
  };

  const submitPhotos = async () => {
    setUploading(true);
    setUploadError(undefined);
    try {
      const form = new FormData();
      photos.forEach((photo) => form.append('photos', photo.file));
      const response = await fetch('/api/items', {
        method: 'POST',
        body: form,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? 'The photos could not be saved');
      setSubmitted(true);
      reloadHomepage();
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : 'The photos could not be saved. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  const lastActivity = [...attention, ...working].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* Keep global chrome quiet: this is a personal working surface, not a marketing site. */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[60px] max-w-[1280px] items-center justify-between px-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-[10px] bg-foreground text-background">
              <Sparkles className="size-4" aria-hidden="true" />
            </div>
            <p className="text-[15px] font-semibold tracking-[-0.025em]">
              Sell My Stuff
            </p>
          </div>

          <nav
            className="hidden items-center gap-7 text-[13px] font-medium md:flex"
            aria-label="Main navigation"
          >
            <button className="text-foreground">Home</button>
            <button className="text-muted-foreground transition-colors hover:text-foreground">
              Items
            </button>
            <button className="text-muted-foreground transition-colors hover:text-foreground">
              Sales
            </button>
          </nav>

          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 rounded-full md:hidden"
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <button
            className="hidden size-8 place-items-center rounded-full border border-border bg-card text-[11px] font-semibold md:grid"
            aria-label="Open settings"
          >
            SM
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-8 sm:px-7 sm:pt-11 lg:px-10 lg:pt-14">
        {/* The first read is temporal and operational: what today looks like, then what to do. */}
        <section className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p
              className="text-[13px] font-medium text-muted-foreground"
              suppressHydrationWarning
            >
              {today}
            </p>
            <h1 className="mt-1 text-[clamp(2.75rem,6vw,4.5rem)] font-semibold leading-none tracking-[-0.065em]">
              Today
            </h1>
          </div>

          <dl className="flex flex-wrap justify-end gap-6 sm:gap-9">
            {(
              [
                { value: stats.ready, label: 'items ready', display: String(stats.ready), alwaysShow: false },
                {
                  value: stats.inProgress,
                  label: 'items in progress',
                  display: String(stats.inProgress),
                  alwaysShow: false,
                },
                { value: stats.live, label: 'items live', display: String(stats.live), alwaysShow: false },
                {
                  value: stats.cleared,
                  label: 'items cleared',
                  display: String(stats.cleared),
                  alwaysShow: false,
                },
                {
                  value: stats.estimatedValueTotal,
                  label: 'estimated value',
                  display: formatGBP(stats.estimatedValueTotal),
                  alwaysShow: true,
                },
                {
                  value: stats.realisedTotal,
                  label: 'realised',
                  display: formatGBP(stats.realisedTotal),
                  alwaysShow: true,
                },
              ] as const
            )
              .filter((stat) => stat.alwaysShow || stat.value > 0)
              .map((stat) => (
              <div key={stat.label} className="flex flex-col sm:items-end">
                <dt className="order-2 mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                  {stat.label}
                </dt>
                <dd className="order-1 text-lg font-semibold tracking-[-0.035em] tabular-nums sm:text-2xl">
                  {stat.display}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Capture stays prominent but compact until the user starts adding photos. */}
        {/* Drag and drop augments the fully accessible file input and button. */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <section
          className={cn(
            'capture-focus mt-8 overflow-hidden rounded-[1.75rem] border p-5 transition-colors sm:p-7',
            dragging && 'border-primary/50 bg-primary/[0.055]',
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          aria-labelledby="capture-heading"
        >
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif"
            capture="environment"
            multiple
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }}
            aria-label="Choose photographs"
          />

          {photos.length === 0 ? (
            <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-10">
              <div>
                <h2
                  id="capture-heading"
                  className="text-[clamp(1.6rem,4vw,2.3rem)] font-semibold leading-tight tracking-[-0.045em]"
                >
                  Add an item
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  Photos start identification and research.
                </p>
                <div className="mt-4 hidden items-center gap-5 text-xs font-medium text-muted-foreground md:flex">
                  <span className="flex items-center gap-1.5">
                    <Upload className="size-3.5" /> Drop files
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ImagePlus className="size-3.5" /> Paste an image
                  </span>
                  <span>HEIC · JPEG · PNG</span>
                </div>
              </div>
              <Button
                className="h-12 w-full rounded-full px-6 text-[15px] shadow-[0_8px_24px_rgba(0,122,255,.22)] sm:w-auto"
                onClick={() => inputRef.current?.click()}
              >
                <Camera data-icon="inline-start" /> Add photos
              </Button>
            </div>
          ) : submitted ? (
            <div className="grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <div className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
                <Check className="size-5" strokeWidth={2.2} />
              </div>
              <div>
                <p className="text-[13px] font-medium text-success">
                  Identification started
                </p>
                <h2
                  id="capture-heading"
                  className="mt-1 text-2xl font-semibold tracking-[-0.04em]"
                >
                  {photos.length === 1
                    ? '1 photo queued'
                    : `${photos.length} photos queued`}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Status will appear below.
                </p>
              </div>
              <Button
                variant="outline"
                className="h-11 rounded-full bg-card/70 px-5"
                onClick={resetCapture}
              >
                <Camera data-icon="inline-start" /> Add another item
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[13px] font-medium text-muted-foreground">
                    New item
                  </p>
                  <h2
                    id="capture-heading"
                    className="mt-1 text-2xl font-semibold tracking-[-0.04em]"
                  >
                    {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
                  </h2>
                </div>
                <Button
                  variant="outline"
                  className="h-11 rounded-full bg-card/70 px-5"
                  onClick={() => inputRef.current?.click()}
                >
                  <ImagePlus data-icon="inline-start" /> Add more
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {photos.map((photo) => (
                  <figure
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-2xl bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo)}
                      className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      aria-label={`Remove ${photo.name}`}
                    >
                      <X className="size-4" />
                    </button>
                  </figure>
                ))}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="grid aspect-square place-items-center rounded-2xl border border-dashed border-primary/30 bg-card/35 text-primary transition hover:bg-card/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                >
                  <span className="flex flex-col items-center gap-2 text-sm font-medium">
                    <ImagePlus className="size-5" /> Add another
                  </span>
                </button>
              </div>

              <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
                {uploadError ? (
                  <p
                    className="mr-auto text-sm font-medium text-destructive"
                    role="alert"
                  >
                    {uploadError}
                  </p>
                ) : null}
                <Button
                  className="h-12 rounded-full px-6 text-[15px] shadow-[0_8px_24px_rgba(0,122,255,.2)]"
                  onClick={submitPhotos}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      Saving photos{' '}
                      <LoaderCircle
                        className="animate-spin"
                        data-icon="inline-end"
                      />
                    </>
                  ) : (
                    <>
                      Start investigating <Sparkles data-icon="inline-end" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Separate human decisions from autonomous work; never make background activity look actionable. */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[1.5rem] border border-border/75 bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[17px] font-semibold tracking-[-0.03em]">
                Needs your attention
              </h2>
              <Button
                variant="ghost"
                className="h-9 rounded-full px-3 text-xs text-primary"
              >
                See all
              </Button>
            </div>

            {homepageStatus === 'loading' ? (
              <p className="py-6 text-sm text-muted-foreground">Loading…</p>
            ) : homepageStatus === 'error' ? (
              <div className="flex items-center justify-between gap-3 py-6">
                <p className="text-sm text-muted-foreground">
                  Could not load current items.
                </p>
                <Button
                  variant="ghost"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={reloadHomepage}
                >
                  Retry
                </Button>
              </div>
            ) : attention.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Nothing needs your attention.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-border/70">
                {attention.map((item) => (
                  <Link
                    key={item.id}
                    href={`/items/${item.id}`}
                    className="group flex min-h-[76px] w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-warning-soft text-warning">
                      <CircleHelp className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold">
                          {item.title}
                        </span>
                        {item.activity ? (
                          <ActivityBadge activity={item.activity} />
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground sm:text-[13px]">
                        {item.reason} · {relativeTime(item.updatedAt)}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[1.5rem] border border-border/75 bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[17px] font-semibold tracking-[-0.03em]">
                Working for you
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground"
                aria-label="Search items"
              >
                <Search />
              </Button>
            </div>

            {homepageStatus === 'loading' ? (
              <p className="py-6 text-sm text-muted-foreground">Loading…</p>
            ) : homepageStatus === 'error' ? (
              <div className="flex items-center justify-between gap-3 py-6">
                <p className="text-sm text-muted-foreground">
                  Could not load current items.
                </p>
                <Button
                  variant="ghost"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={reloadHomepage}
                >
                  Retry
                </Button>
              </div>
            ) : working.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Nothing in progress.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-border/70">
                {working.map((item) => (
                  <Link
                    key={item.id}
                    href={`/items/${item.id}`}
                    className="group flex min-h-[76px] w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-primary/10 text-primary">
                      <Sparkles className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold">
                          {item.title}
                        </span>
                        <ActivityBadge activity={item.activity} />
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground sm:text-[13px]">
                        {item.stage} · {relativeTime(item.updatedAt)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-5 flex items-center gap-3 rounded-[1.25rem] border border-border/60 bg-card/55 px-4 py-3 text-sm text-muted-foreground sm:px-5">
          <Clock3 className="size-4 shrink-0" />
          <p>
            {lastActivity
              ? `Last activity: ${lastActivity.title} updated ${relativeTime(lastActivity.updatedAt)}.`
              : 'No recent activity.'}
          </p>
          <PackageCheck className="ml-auto hidden size-4 shrink-0 text-success sm:block" />
        </section>
      </div>
    </main>
  );
}
