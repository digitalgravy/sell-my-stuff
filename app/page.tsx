'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  ImagePlus,
  Menu,
  PackageCheck,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { isSupportedImage } from '@/lib/capture-policy';

type Photo = { id: string; name: string; url: string };

const queue = [
  {
    name: 'Apple Magic Keyboard',
    detail: 'Checking the exact model and recent sales',
    state: 'Researching',
    progress: 64,
    accent: 'from-[#d9e2df] to-[#aebbb8]',
  },
  {
    name: 'NVIDIA graphics card',
    detail: 'One label photo will confirm the variant',
    state: 'Needs you',
    progress: 82,
    accent: 'from-[#d8d9cb] to-[#aeb19b]',
  },
  {
    name: 'Sony headphones',
    detail: 'Draft listing and valuation are ready',
    state: 'Ready',
    progress: 100,
    accent: 'from-[#cfcbd0] to-[#a9a4ad]',
  },
];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = Array.from(files)
      .filter(isSupportedImage)
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        url: URL.createObjectURL(file),
      }));
    if (next.length) {
      setPhotos((current) => [...current, ...next]);
      setSubmitted(false);
    }
  }, []);

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
  };

  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_7px_18px_rgba(32,70,58,.18)]">
              <Sparkles className="size-[18px]" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-[17px] font-semibold leading-none tracking-[-0.025em]">
                Sell My Stuff
              </p>
              <p className="mt-1 hidden text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:block">
                Photograph clutter. Turn it into money.
              </p>
            </div>
          </div>
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Main navigation"
          >
            <Button
              variant="ghost"
              className="h-10 rounded-xl px-4 text-primary"
            >
              Home
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-xl px-4 text-muted-foreground"
            >
              Items
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-xl px-4 text-muted-foreground"
            >
              Sales
            </Button>
          </nav>
          <Button
            variant="ghost"
            size="icon-lg"
            className="rounded-xl md:hidden"
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <Button
            variant="outline"
            className="hidden h-10 rounded-xl bg-card/70 px-4 md:inline-flex"
          >
            Settings
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] gap-10 px-4 pb-24 pt-7 sm:px-7 sm:pt-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)] lg:px-10 lg:pt-12">
        <section className="min-w-0">
          <div className="mb-7 max-w-2xl">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-primary/70">
              <span className="size-1.5 rounded-full bg-accent-strong" />
              Ready when you are
            </p>
            <h1 className="font-display text-[clamp(2.25rem,6vw,4.75rem)] font-semibold leading-[0.94] tracking-[-0.055em] text-balance">
              What are we selling?
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-6 text-muted-foreground sm:text-base">
              Take a few photos. I’ll identify the item, research it, and only
              come back if I genuinely need something from you.
            </p>
          </div>

          <div
            className={cn(
              'capture-surface relative min-h-[360px] rounded-[2rem] border p-4 transition sm:min-h-[440px] sm:p-6',
              dragging && 'border-primary/60 bg-primary/[0.035]',
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
          >
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif"
              capture="environment"
              multiple
              onChange={(event) =>
                event.target.files && addFiles(event.target.files)
              }
              aria-label="Choose photographs"
            />

            {photos.length === 0 ? (
              <div className="flex min-h-[326px] flex-col items-center justify-center px-4 text-center sm:min-h-[392px]">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="camera-button group relative grid size-28 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_22px_55px_rgba(32,70,58,.25)] transition hover:-translate-y-1 hover:shadow-[0_28px_65px_rgba(32,70,58,.3)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-[.98] motion-reduce:transform-none sm:size-32"
                  aria-label="Take or choose photos"
                >
                  <Camera
                    className="size-9 transition-transform group-hover:scale-105 sm:size-10"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="absolute -right-1 top-2 grid size-8 place-items-center rounded-full border-4 border-card bg-accent-strong text-white">
                    <ImagePlus className="size-4" />
                  </span>
                </button>
                <h2 className="font-display mt-7 text-xl font-semibold tracking-[-0.025em]">
                  Take or add photos
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Front, back, labels and any wear are useful. Add several items
                  now—you don’t need to wait between them.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Upload className="size-3.5" /> Drop files
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ImagePlus className="size-3.5" /> Paste an image
                  </span>
                  <span>HEIC · JPEG · PNG</span>
                </div>
              </div>
            ) : submitted ? (
              <div className="flex min-h-[326px] flex-col items-center justify-center px-4 text-center sm:min-h-[392px]">
                <div className="grid size-20 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-9" strokeWidth={2} />
                </div>
                <Badge className="mt-6 bg-primary/10 text-primary">
                  Research started
                </Badge>
                <h2 className="font-display mt-4 text-2xl font-semibold tracking-[-0.03em]">
                  I’ll take it from here
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Your{' '}
                  {photos.length === 1
                    ? 'photo is'
                    : `${photos.length} photos are`}{' '}
                  queued. You can close this page or add another item while the
                  work continues.
                </p>
                <Button
                  className="mt-7 h-11 rounded-xl px-5"
                  onClick={() => {
                    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
                    setPhotos([]);
                    setSubmitted(false);
                  }}
                >
                  Photograph another item <Camera data-icon="inline-end" />
                </Button>
              </div>
            ) : (
              <div className="flex min-h-[326px] flex-col sm:min-h-[392px]">
                <div className="flex items-center justify-between px-1 pb-4">
                  <div>
                    <p className="font-display text-lg font-semibold">
                      {photos.length} {photos.length === 1 ? 'photo' : 'photos'}{' '}
                      added
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Add more angles if they’ll help identify the item.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl"
                    onClick={() => inputRef.current?.click()}
                  >
                    <ImagePlus data-icon="inline-start" /> Add more
                  </Button>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map((photo) => (
                    <figure
                      key={photo.id}
                      className="group relative min-h-36 overflow-hidden rounded-2xl bg-muted"
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
                        className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        aria-label={`Remove ${photo.name}`}
                      >
                        <X className="size-4" />
                      </button>
                    </figure>
                  ))}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-primary/25 bg-primary/[0.025] text-primary transition hover:bg-primary/[0.055] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                  >
                    <span className="flex flex-col items-center gap-2 text-sm font-medium">
                      <ImagePlus className="size-6" /> Add another
                    </span>
                  </button>
                </div>
                <Button
                  className="mt-4 h-12 w-full rounded-2xl text-[15px] shadow-[0_12px_28px_rgba(32,70,58,.18)]"
                  onClick={() => setSubmitted(true)}
                >
                  Start investigating <Sparkles data-icon="inline-end" />
                </Button>
              </div>
            )}
          </div>

          <div className="mt-7 grid grid-cols-3 gap-3">
            {[
              ['14', 'items cleared'],
              ['£742', 'realised'],
              ['~£1,180', 'waiting'],
            ].map(([value, label]) => (
              <div
                key={label}
                className="rounded-2xl border border-border/70 bg-card/60 px-3 py-4 sm:px-5"
              >
                <p className="font-display text-lg font-semibold tracking-[-0.03em] sm:text-2xl">
                  {value}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground sm:text-xs">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <aside className="min-w-0 lg:pt-5">
          <section className="rounded-[1.75rem] border border-border/70 bg-card/85 p-5 shadow-[0_18px_60px_rgba(46,48,41,.07)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
                  3 things need you
                </p>
                <h2 className="font-display mt-2 text-2xl font-semibold tracking-[-0.035em]">
                  Tiny actions, big progress
                </h2>
              </div>
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-warning-soft text-warning">
                <CircleHelp className="size-5" />
              </div>
            </div>
            <button className="mt-6 flex w-full items-center gap-4 rounded-2xl bg-warning-soft/70 p-4 text-left transition hover:bg-warning-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-card text-warning shadow-sm">
                <Camera className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display truncate font-semibold">
                  NVIDIA graphics card
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Photograph the label on the back so I can confirm the model.
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </button>
            <button className="mt-2 flex w-full items-center gap-4 rounded-2xl p-4 text-left transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-primary">
                <PackageCheck className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display truncate font-semibold">
                  Sony headphones
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Review the £84 sale proposal.
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </button>
            <Button
              variant="ghost"
              className="mt-2 h-10 w-full rounded-xl text-muted-foreground"
            >
              See all actions <ArrowRight data-icon="inline-end" />
            </Button>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-[-0.025em]">
                  Working in the background
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Everything keeps moving while you’re away.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl"
                aria-label="Search items"
              >
                <Search />
              </Button>
            </div>
            <div className="space-y-2">
              {queue.map((item, index) => (
                <button
                  key={item.name}
                  className="queue-row group flex w-full items-center gap-3 rounded-2xl border border-border/65 bg-card/65 p-3 text-left transition hover:-translate-y-0.5 hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 motion-reduce:transform-none"
                >
                  <div
                    className={cn(
                      'grid size-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-primary/65',
                      item.accent,
                    )}
                  >
                    {index === 0 ? (
                      <Sparkles className="size-5" />
                    ) : index === 1 ? (
                      <Clock3 className="size-5" />
                    ) : (
                      <Check className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display truncate text-sm font-semibold">
                        {item.name}
                      </p>
                      <span
                        className={cn(
                          'shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em]',
                          item.state === 'Needs you'
                            ? 'text-warning'
                            : item.state === 'Ready'
                              ? 'text-success'
                              : 'text-primary/65',
                        )}
                      >
                        {item.state}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {item.detail}
                    </p>
                    <Progress
                      value={item.progress}
                      className="mt-2 [&_[data-slot=progress-indicator]]:bg-accent-strong [&_[data-slot=progress-track]]:h-1"
                    />
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
