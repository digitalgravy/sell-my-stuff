import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { PostgresItemDetailRepository } from '@/server/items/postgres-item-detail-repository';

export const runtime = 'nodejs';

// The one endpoint in this app with real, live, financial consequences --
// it goes on sale on eBay the instant this succeeds. Must only ever be
// called from the explicit "Approve and publish" confirmation dialog on
// this exact listing (see item-detail-view.tsx) -- never automatically.
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
    const outcome = await new PostgresItemDetailRepository().publishListing(id);
    if (!outcome.ok) {
      return Response.json({ error: outcome.reason }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error(
      'Failed to publish a listing to eBay',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json(
      { error: 'Could not publish this listing' },
      { status: 500 },
    );
  }
}
