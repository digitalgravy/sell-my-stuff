'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, Plus, Sparkles } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  CreateInventoryItemInput,
  InventoryCategory,
  InventoryItem,
  InventoryUnit,
} from '@/server/inventory/inventory-repository';

type LoadStatus = 'loading' | 'ready' | 'error';

const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  bag: 'Bags',
  wrap: 'Wrap',
  box: 'Boxes',
  tape: 'Tape',
  label: 'Labels',
  other: 'Other',
};

const UNIT_LABEL: Record<InventoryUnit, string> = {
  each: 'each',
  roll: 'roll',
  sheet: 'sheet',
  metre: 'metre',
};

const EMPTY_DRAFT: CreateInventoryItemInput = {
  name: '',
  category: 'box',
  unit: 'each',
  quantityOnHand: 0,
  lowStockThreshold: 0,
};

async function requestInventory(): Promise<InventoryItem[]> {
  const response = await fetch('/api/inventory');
  if (!response.ok) throw new Error('Could not load inventory');
  const data = (await response.json()) as { inventory: InventoryItem[] };
  return data.inventory;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<CreateInventoryItemInput>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    requestInventory()
      .then((data) => {
        setInventory(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    requestInventory()
      .then((data) => {
        setInventory(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  const createItem = useCallback(() => {
    if (draft.name.trim().length === 0) return;
    setSaving(true);
    fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        setAddOpen(false);
        setDraft(EMPTY_DRAFT);
        reload();
      })
      .catch(() => undefined)
      .finally(() => setSaving(false));
  }, [draft, reload]);

  const adjust = useCallback(
    (id: string, delta: number) => {
      setAdjustingId(id);
      fetch(`/api/inventory/${id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta, reason: delta > 0 ? 'restock' : 'correction' }),
      })
        .then((response) => {
          if (!response.ok) throw new Error();
          reload();
        })
        .catch(() => undefined)
        .finally(() => setAdjustingId(null));
    },
    [reload],
  );

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
            <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
              Home
            </Link>
            <Link href="/items" className="text-muted-foreground transition-colors hover:text-foreground">
              Items
            </Link>
            <Link href="/inventory" className="text-foreground">
              Inventory
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[clamp(2.25rem,5vw,3.25rem)] font-semibold leading-none tracking-[-0.05em]">
              Inventory
            </h1>
            <p className="text-sm text-muted-foreground">
              Packaging supplies -- boxes, wrap, bags, tape.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add supply
          </Button>
        </div>

        <div className="mt-6 rounded-[1.75rem] border border-border/75 bg-card">
          {status === 'loading' ? (
            <p className="p-8 text-sm text-muted-foreground">Loading inventory…</p>
          ) : status === 'error' ? (
            <p className="p-8 text-sm text-destructive">Could not load inventory.</p>
          ) : inventory.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground">
              No supplies tracked yet -- add boxes, bubble wrap, bags and tape as you buy them.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Supply</TableHead>
                    <TableHead className="w-32">Category</TableHead>
                    <TableHead className="w-40 text-right">Stock</TableHead>
                    <TableHead className="w-32 text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.map((item) => {
                    const lowStock = item.quantityOnHand <= item.lowStockThreshold;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.name}</p>
                          {item.notes ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {CATEGORY_LABEL[item.category]}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {lowStock ? (
                              <Badge className="border-transparent bg-warning-soft text-warning">
                                Low
                              </Badge>
                            ) : null}
                            <span className="tabular-nums">
                              {item.quantityOnHand} {UNIT_LABEL[item.unit]}
                              {item.quantityOnHand === 1 ? '' : 's'}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-7"
                              disabled={adjustingId === item.id || item.quantityOnHand === 0}
                              onClick={() => adjust(item.id, -1)}
                            >
                              −
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-7"
                              disabled={adjustingId === item.id}
                              onClick={() => adjust(item.id, 1)}
                            >
                              +
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {relativeTime(item.updatedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a packaging supply</DialogTitle>
            <DialogDescription>Track a box, wrap, bag or tape you keep on hand.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inventory-name">Name</Label>
              <Input
                id="inventory-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="e.g. Anti-static bag"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(value) => setDraft({ ...draft, category: value as InventoryCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select
                  value={draft.unit}
                  onValueChange={(value) => setDraft({ ...draft, unit: value as InventoryUnit })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(UNIT_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inventory-quantity">Quantity on hand</Label>
                <Input
                  id="inventory-quantity"
                  type="number"
                  min={0}
                  value={draft.quantityOnHand}
                  onChange={(event) =>
                    setDraft({ ...draft, quantityOnHand: Math.max(0, Number(event.target.value)) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inventory-threshold">Low-stock threshold</Label>
                <Input
                  id="inventory-threshold"
                  type="number"
                  min={0}
                  value={draft.lowStockThreshold}
                  onChange={(event) =>
                    setDraft({ ...draft, lowStockThreshold: Math.max(0, Number(event.target.value)) })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setDraft(EMPTY_DRAFT);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={saving || draft.name.trim().length === 0}
              onClick={createItem}
              className={cn(saving && 'opacity-70')}
            >
              {saving ? 'Adding…' : 'Add supply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
