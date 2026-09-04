'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ImagePlus,
  LoaderCircle,
  Menu,
  PackageCheck,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { isSupportedImage } from '@/lib/capture-policy';

type Photo = { id: string; name: string; url: string; file: File };

const queue = [
  {
    name: 'Apple Magic Keyboard',
    detail: 'Checking the exact model and recent sales',
    state: 'Researching',
    progress: 64,
    icon: Sparkles,
  },
  {
    name: 'Sony headphones',
    detail: 'Draft listing and valuation complete',
    state: 'Ready',
    progress: 100,
    icon: Check,
  },
];

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

          <dl className="grid grid-cols-3 gap-6 sm:gap-9">
            {[
              ['14', 'items cleared'],
              ['£742', 'realised'],
              ['£1,180', 'in progress'],
            ].map(([value, label]) => (
              <div key={label} className="flex flex-col sm:items-end">
                <dt className="order-2 mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                  {label}
                </dt>
                <dd className="order-1 text-lg font-semibold tracking-[-0.035em] sm:text-2xl">
                  {value}
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

            <div className="mt-3 divide-y divide-border/70">
              <button className="group flex min-h-[76px] w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20">
                <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-warning-soft text-warning">
                  <Camera className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    Photograph the graphics card label
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground sm:text-[13px]">
                    NVIDIA graphics card · model confirmation
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
              <button className="group flex min-h-[76px] w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20">
                <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-primary/10 text-primary">
                  <CircleDollarSign className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    Review the £84 sale proposal
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground sm:text-[13px]">
                    Sony headphones · ready to approve
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
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

            <div className="mt-3 divide-y divide-border/70">
              {queue.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    className="group flex min-h-[76px] w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-primary/10 text-primary">
                      <Icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold">
                          {item.name}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[11px] font-semibold',
                            item.state === 'Ready'
                              ? 'text-success'
                              : 'text-primary',
                          )}
                        >
                          {item.state}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground sm:text-[13px]">
                        {item.detail}
                      </span>
                      {item.progress < 100 ? (
                        <Progress
                          value={item.progress}
                          aria-label={`${item.name} progress`}
                          className="mt-2 [&_[data-slot=progress-indicator]]:bg-primary [&_[data-slot=progress-track]]:h-[3px]"
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <section className="mt-5 flex items-center gap-3 rounded-[1.25rem] border border-border/60 bg-card/55 px-4 py-3 text-sm text-muted-foreground sm:px-5">
          <Clock3 className="size-4 shrink-0" />
          <p>Last activity: Magic Keyboard research updated 8 minutes ago.</p>
          <PackageCheck className="ml-auto hidden size-4 shrink-0 text-success sm:block" />
        </section>
      </div>
    </main>
  );
}
