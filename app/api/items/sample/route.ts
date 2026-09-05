import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { buildSampleItemDetail } from '@/server/items/sample-item-detail';

export const runtime = 'nodejs';

// No CAPTURE_API_ENABLED / database gate here on purpose: this is fully
// fake, hand-authored data used to preview the finished design ahead of the
// real pipeline producing it (see the real /api/items/[id] route for the
// honest, DB-backed version).
export async function GET(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json(
      { error: 'Untrusted request origin' },
      { status: 403 },
    );
  }

  return Response.json(buildSampleItemDetail());
}
