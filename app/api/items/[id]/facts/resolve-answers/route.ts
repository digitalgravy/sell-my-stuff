import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import type { FactAnswerSubmission } from '@/server/items/item-detail-repository';
import { PostgresItemDetailRepository } from '@/server/items/postgres-item-detail-repository';

export const runtime = 'nodejs';

function isFactAnswerSubmission(value: unknown): value is FactAnswerSubmission {
  const field = (value as { field?: unknown } | null)?.field;
  return (
    typeof value === 'object' &&
    value !== null &&
    (field === undefined || typeof field === 'string') &&
    typeof (value as { question?: unknown }).question === 'string' &&
    typeof (value as { answer?: unknown }).answer === 'string' &&
    (value as { answer: string }).answer.trim().length > 0
  );
}

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
  const answers = (body as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers) || !answers.every(isFactAnswerSubmission)) {
    return Response.json(
      {
        error:
          'Expected a JSON body with "answers": an array of { field, question, answer } with non-empty answer text',
      },
      { status: 400 },
    );
  }

  try {
    const outcome = await new PostgresItemDetailRepository().resolveFactAnswers(
      id,
      answers,
    );
    if (!outcome.ok) {
      return Response.json({ error: outcome.reason }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error(
      'Failed to resolve fact answers',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json(
      { error: 'Could not resolve these answers' },
      { status: 500 },
    );
  }
}
