import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import type { InventoryAdjustmentReason } from '@/server/inventory/inventory-repository';
import { PostgresInventoryRepository } from '@/server/inventory/postgres-inventory-repository';

export const runtime = 'nodejs';

const REASONS: InventoryAdjustmentReason[] = ['restock', 'used_on_item', 'correction'];

export async function POST(
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
  const { delta, reason } =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (
    typeof delta !== 'number' ||
    !Number.isInteger(delta) ||
    delta === 0 ||
    typeof reason !== 'string' ||
    !REASONS.includes(reason as InventoryAdjustmentReason)
  ) {
    return Response.json(
      { error: 'Expected a JSON body with { delta: non-zero integer, reason: "restock" | "used_on_item" | "correction" }' },
      { status: 400 },
    );
  }

  try {
    const outcome = await new PostgresInventoryRepository().adjustStock(
      id,
      delta,
      reason as InventoryAdjustmentReason,
    );
    if (!outcome.ok) return Response.json({ error: outcome.reason }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Failed to adjust inventory stock', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Could not adjust stock' }, { status: 500 });
  }
}
