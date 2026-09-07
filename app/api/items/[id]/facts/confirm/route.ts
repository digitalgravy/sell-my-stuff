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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { field?: unknown }).field !== 'string'
  ) {
    return Response.json(
      { error: 'Expected a JSON body with string "field"' },
      { status: 400 },
    );
  }
  const { field } = body as { field: string };

  try {
    const outcome = await new PostgresItemDetailRepository().confirmFact(id, field);
    if (!outcome.ok) {
      return Response.json({ error: outcome.reason }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error(
      'Failed to confirm a fact',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json(
      { error: 'Could not confirm this fact' },
      { status: 500 },
    );
  }
}
