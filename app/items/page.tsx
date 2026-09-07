'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, Menu, Sparkles } from 'lucide-react';

import { CompactPhaseStrip } from '@/components/phase-strip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatGBP, relativeTime } from '@/lib/format';
import type { ItemListEntry, ItemListPill } from '@/server/items/items-list';

type LoadStatus = 'loading' | 'ready' | 'error';
type FilterValue = 'all' | 'ready' | 'needs_action' | 'complete';
type SortColumn = 'title' | 'status' | 'price' | 'updated';
type SortDirection = 'asc' | 'desc';

const PILL_STYLE: Record<ItemListPill, string> = {
  needs_action: 'bg-warning-soft text-warning',
  ready: 'bg-success-soft text-success',
  at_auction: 'bg-primary/10 text-primary',
  complete: 'bg-accent-strong/10 text-accent-strong',
  in_progress: 'bg-muted text-muted-foreground',
};

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'needs_action', label: 'Needs action' },
  { value: 'complete', label: 'Complete' },
];

const SORT_LABEL: Record<SortColumn, string> = {
  title: 'Item',
  status: 'Status',
  price: 'Estimated profit',
  updated: 'Updated',
};

const PILL_SORT_RANK: Record<ItemListPill, number> = {
  needs_action: 0,
  in_progress: 1,
  ready: 2,
  at_auction: 3,
  complete: 4,
};

async function requestItems(): Promise<ItemListEntry[]> {
  const response = await fetch('/api/items/list');
  if (!response.ok) throw new Error('Could not load items');
  const data = (await response.json()) as { items: ItemListEntry[] };
  return data.items;
}

export default function ItemsPage() {
  const [items, setItems] = useState<ItemListEntry[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sortColumn, setSortColumn] = useState<SortColumn>('updated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    let cancelled = false;
    requestItems()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSort = useCallback(
    (column: SortColumn) => {
      if (column === sortColumn) {
        setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    },
    [sortColumn],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'ready') return items.filter((item) => item.pill === 'ready');
    if (filter === 'complete') return items.filter((item) => item.pill === 'complete');
    return items.filter((item) => item.pill === 'needs_action');
  }, [items, filter]);

  const sorted = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortColumn) {
        case 'title':
          return direction * a.title.localeCompare(b.title);
        case 'status':
          return direction * (PILL_SORT_RANK[a.pill] - PILL_SORT_RANK[b.pill]);
        case 'price':
          return direction * ((a.estimatedProfit ?? -1) - (b.estimatedProfit ?? -1));
        case 'updated':
          return direction * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      }
    });
  }, [filtered, sortColumn, sortDirection]);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[60px] max-w-[1280px] items-center justify-between px-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-[10px] bg-foreground text-background">
              <Sparkles className="size-4" aria-hidden="true" />
            </div>
            <p className="text-[15px] font-semibold tracking-[-0.025em]">Sell My Stuff</p>
          </div>

          <nav
            className="hidden items-center gap-7 text-[13px] font-medium md:flex"
            aria-label="Main navigation"
          >
            <Link
              href="/"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Home
            </Link>
            <Link href="/items" className="text-foreground">
              Items
            </Link>
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
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-8 sm:px-7 sm:pt-11 lg:px-10 lg:pt-14">
        <div className="flex flex-col gap-1">
          <h1 className="text-[clamp(2.25rem,5vw,3.25rem)] font-semibold leading-none tracking-[-0.05em]">
            Items
          </h1>
          <p className="text-sm text-muted-foreground">
            {status === 'ready'
              ? `${sorted.length} of ${items.length} item${items.length === 1 ? '' : 's'}`
              : ' '}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                filter === option.value
                  ? 'border-transparent bg-foreground text-background'
                  : 'border-border/75 text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-[1.75rem] border border-border/75 bg-card">
          {status === 'loading' ? (
            <p className="p-8 text-sm text-muted-foreground">Loading items…</p>
          ) : status === 'error' ? (
            <p className="p-8 text-sm text-destructive">Could not load items.</p>
          ) : sorted.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground">
              {items.length === 0
                ? 'No items yet — add some photos from the homepage to get started.'
                : 'Nothing matches this filter.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[64px]" />
                    <SortableHead
                      column="title"
                      active={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      column="status"
                      active={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <TableHead>Progress</TableHead>
                    <SortableHead
                      column="price"
                      active={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                      className="text-right"
                    />
                    <SortableHead
                      column="updated"
                      active={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                      className="text-right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((item) => (
                    <TableRow key={item.id} className="cursor-pointer">
                      <TableCell className="p-2">
                        <Link href={`/items/${item.id}`} className="block">
                          {item.heroPhotoUrl ? (
                            <Image
                              src={item.heroPhotoUrl}
                              alt=""
                              width={48}
                              height={48}
                              className="size-12 rounded-xl object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="size-12 rounded-xl bg-muted" />
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/items/${item.id}`} className="block font-medium">
                          {item.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/items/${item.id}`} className="block">
                          <Badge className={cn('border-transparent', PILL_STYLE[item.pill])}>
                            {item.pillLabel.toUpperCase()}
                          </Badge>
                          {item.detail ? (
                            <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/items/${item.id}`} className="block">
                          <CompactPhaseStrip phases={item.phases} />
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link href={`/items/${item.id}`} className="block">
                          {item.estimatedProfit !== undefined
                            ? formatGBP(item.estimatedProfit)
                            : '—'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        <Link href={`/items/${item.id}`} className="block">
                          {relativeTime(item.updatedAt)}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function SortableHead({
  column,
  active,
  direction,
  onSort,
  className,
}: {
  column: SortColumn;
  active: SortColumn;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const isActive = active === column;
  const Icon = isActive ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1.5 transition-colors hover:text-foreground',
          isActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {SORT_LABEL[column]}
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </TableHead>
  );
}
