import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { PostgresCaptureInboxRepository } from '@/server/items/postgres-capture-inbox-repository';

export const runtime = 'nodejs';

// 8MB -- a real eBay search-results page is well under 2MB; this is a
// generous ceiling against a mistaken or malicious oversized body, not
// a tuned limit.
const MAX_CAPTURE_HTML_BYTES = 8 * 1024 * 1024;

// The CORS headers below exist for exactly one reason: the bookmarklet
// (see app/tools/capture) runs injected into whatever page the user is
// on -- eBay, not this app -- so its fetch() to this endpoint is
// genuinely cross-origin. isTrustedRequestOrigin (same-origin checks
// used by every other mutating route) would correctly reject it, so
// this route uses a separate shared-secret token instead. The app is
// LAN-only (network.exposeExternally: false) already; the token is
// defense in depth on top of that, not the only thing standing between
// this endpoint and the internet.
function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  const captures = await new PostgresCaptureInboxRepository().listPendingCaptures();
  return Response.json({ captures });
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const expectedToken = process.env.CAPTURE_INBOX_TOKEN;
  if (!expectedToken || token !== expectedToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 403, headers: corsHeaders() });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400, headers: corsHeaders() });
  }
  if (typeof body !== 'object' || body === null || typeof (body as { html?: unknown }).html !== 'string') {
    return Response.json(
      { error: 'Expected a JSON body with a string "html"' },
      { status: 400, headers: corsHeaders() },
    );
  }
  const html = (body as { html: string }).html;
  if (Buffer.byteLength(html, 'utf8') > MAX_CAPTURE_HTML_BYTES) {
    return Response.json({ error: 'Captured page is too large' }, { status: 413, headers: corsHeaders() });
  }
  const sourceUrlRaw = (body as { sourceUrl?: unknown }).sourceUrl;
  const sourceUrl = typeof sourceUrlRaw === 'string' ? sourceUrlRaw : null;

  try {
    const result = await new PostgresCaptureInboxRepository().saveCapture(html, sourceUrl);
    return Response.json({ ok: true, ...result }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Failed to save a research capture', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Could not save this capture' }, { status: 500, headers: corsHeaders() });
  }
}
