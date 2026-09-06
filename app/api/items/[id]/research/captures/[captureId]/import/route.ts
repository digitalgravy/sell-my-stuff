import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { PostgresCaptureInboxRepository } from '@/server/items/postgres-capture-inbox-repository';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; captureId: string }> },
) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  const { id, captureId } = await params;

  try {
    const outcome = await new PostgresCaptureInboxRepository().importCapture(captureId, id);
    if (!outcome.ok) {
      return Response.json({ error: outcome.reason }, { status: 400 });
    }
    return Response.json({ ok: true, imported: outcome.imported });
  } catch (error) {
    console.error('Failed to import a research capture', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Could not import this capture' }, { status: 500 });
  }
}
