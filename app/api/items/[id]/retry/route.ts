import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { PostgresItemDetailRepository } from '@/server/items/postgres-item-detail-repository';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json(
      { error: 'Untrusted request origin' },
      { status: 403 },
    );
  }
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ error: 'Item not found' }, { status: 404 });
  }

  const { id } = await params;

  try {
    const outcome = await new PostgresItemDetailRepository().retryFailedItem(
      id,
    );
    if (!outcome.ok) {
      return Response.json({ error: outcome.reason }, { status: 400 });
    }
    return Response.json({ status: 'INBOX' });
  } catch (error) {
    console.error(
      'Failed to retry an item',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json(
      { error: 'Could not retry this item' },
      { status: 500 },
    );
  }
}
