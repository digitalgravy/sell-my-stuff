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
    return Response.json({
      attention: [],
      working: [],
      stats: { ready: 0, inProgress: 0, live: 0, cleared: 0, realisedTotal: 0, estimatedValueTotal: 0 },
    });
  }

  try {
    const repository = new PostgresHomepageRepository();
    const [rows, outcomeCounts] = await Promise.all([
      repository.listActiveItems(),
      repository.getOutcomeCounts(),
    ]);
    return Response.json(buildHomepageSnapshot(rows, outcomeCounts));
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
