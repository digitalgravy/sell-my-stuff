import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import type { InventoryCategory, InventoryUnit } from '@/server/inventory/inventory-repository';
import { PostgresInventoryRepository } from '@/server/inventory/postgres-inventory-repository';

export const runtime = 'nodejs';

const CATEGORIES: InventoryCategory[] = ['bag', 'wrap', 'box', 'tape', 'label', 'other'];
const UNITS: InventoryUnit[] = ['each', 'roll', 'sheet', 'metre'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json({ error: 'Untrusted request origin' }, { status: 403 });
  }
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ error: 'Inventory item not found' }, { status: 404 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  const { name, category, unit, lowStockThreshold, notes } = body as Record<string, unknown>;
  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    return Response.json({ error: 'name must be a non-empty string' }, { status: 400 });
  }
  if (category !== undefined && !CATEGORIES.includes(category as InventoryCategory)) {
    return Response.json({ error: 'Invalid category' }, { status: 400 });
  }
  if (unit !== undefined && !UNITS.includes(unit as InventoryUnit)) {
    return Response.json({ error: 'Invalid unit' }, { status: 400 });
  }
  if (
    lowStockThreshold !== undefined &&
    (typeof lowStockThreshold !== 'number' || lowStockThreshold < 0)
  ) {
    return Response.json({ error: 'lowStockThreshold must be a number >= 0' }, { status: 400 });
  }

  try {
    const outcome = await new PostgresInventoryRepository().updateInventoryItem(id, {
      name: typeof name === 'string' ? name.trim() : undefined,
      category: category as InventoryCategory | undefined,
      unit: unit as InventoryUnit | undefined,
      lowStockThreshold: lowStockThreshold as number | undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    });
    if (!outcome.ok) return Response.json({ error: outcome.reason }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Failed to update inventory item', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Could not update inventory item' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json({ error: 'Untrusted request origin' }, { status: 403 });
  }
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ error: 'Inventory item not found' }, { status: 404 });
  }

  const { id } = await params;

  try {
    const outcome = await new PostgresInventoryRepository().deleteInventoryItem(id);
    if (!outcome.ok) return Response.json({ error: outcome.reason }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete inventory item', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Could not delete inventory item' }, { status: 500 });
  }
}
