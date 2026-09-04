import { buildHomepageSnapshot } from '@/server/items/homepage-snapshot';
import { PostgresHomepageRepository } from '@/server/items/postgres-homepage-repository';
import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json(
      { error: 'Untrusted request origin' },
      { status: 403 },
    );
  }

  // No persistence exists until capture is enabled, so there are truthfully
  // zero items rather than an error to surface.
  if (process.env.CAPTURE_API_ENABLED !== 'true') {
    return Response.json({ attention: [], working: [] });
  }

  try {
    const rows = await new PostgresHomepageRepository().listActiveItems();
    return Response.json(buildHomepageSnapshot(rows));
  } catch (error) {
    console.error(
      'Failed to load homepage items',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json(
      { error: 'Could not load current items' },
      { status: 500 },
    );
  }
}
