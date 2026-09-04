import { PostgresItemDetailRepository } from '@/server/items/postgres-item-detail-repository';
import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json(
      { error: 'Untrusted request origin' },
      { status: 403 },
    );
  }

  // No persistence exists until capture is enabled, so no item can
  // truthfully exist yet.
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ error: 'Item not found' }, { status: 404 });
  }

  const { id } = await params;

  try {
    const detail = await new PostgresItemDetailRepository().getItemDetail(id);
    if (!detail) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }
    return Response.json(detail);
  } catch (error) {
    console.error(
      'Failed to load item detail',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json(
      { error: 'Could not load this item' },
      { status: 500 },
    );
  }
}
