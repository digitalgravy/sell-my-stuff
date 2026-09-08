import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import type { InventoryCategory, InventoryUnit } from '@/server/inventory/inventory-repository';
import { PostgresInventoryRepository } from '@/server/inventory/postgres-inventory-repository';

export const runtime = 'nodejs';

const CATEGORIES: InventoryCategory[] = ['bag', 'wrap', 'box', 'tape', 'label', 'other'];
const UNITS: InventoryUnit[] = ['each', 'roll', 'sheet', 'metre'];

export async function GET(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json({ error: 'Untrusted request origin' }, { status: 403 });
  }
  // No persistence exists until capture is enabled, so there is truthfully
  // no inventory yet rather than an error to surface.
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ inventory: [] });
  }

  try {
    const inventory = await new PostgresInventoryRepository().listInventory();
    return Response.json({ inventory });
  } catch (error) {
    console.error('Failed to load inventory', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Could not load inventory' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json({ error: 'Untrusted request origin' }, { status: 403 });
  }
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ error: 'Inventory is not available yet' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  const {
    name,
    category,
    unit,
    quantityOnHand,
    lowStockThreshold,
    notes,
  } = body as Record<string, unknown>;
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    typeof category !== 'string' ||
    !CATEGORIES.includes(category as InventoryCategory) ||
    typeof unit !== 'string' ||
    !UNITS.includes(unit as InventoryUnit) ||
    typeof quantityOnHand !== 'number' ||
    quantityOnHand < 0 ||
    typeof lowStockThreshold !== 'number' ||
    lowStockThreshold < 0
  ) {
    return Response.json(
      {
        error:
          'Expected a JSON body with { name: non-empty string, category, unit, quantityOnHand: number >= 0, lowStockThreshold: number >= 0 }',
      },
      { status: 400 },
    );
  }

  try {
    const item = await new PostgresInventoryRepository().createInventoryItem({
      name: name.trim(),
      category: category as InventoryCategory,
      unit: unit as InventoryUnit,
      quantityOnHand,
      lowStockThreshold,
      notes: typeof notes === 'string' && notes.length > 0 ? notes : undefined,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Failed to create inventory item', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Could not create inventory item' }, { status: 500 });
  }
}
