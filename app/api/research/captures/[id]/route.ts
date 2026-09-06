import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { PostgresCaptureInboxRepository } from '@/server/items/postgres-capture-inbox-repository';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  const { id } = await params;
  const outcome = await new PostgresCaptureInboxRepository().deleteCapture(id);
  if (!outcome.ok) {
    return Response.json({ error: 'Capture not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
