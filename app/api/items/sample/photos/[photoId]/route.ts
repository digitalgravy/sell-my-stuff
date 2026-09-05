import { isTrustedRequestOrigin } from '@/server/http/trusted-origin';
import { SAMPLE_PHOTOS } from '@/server/items/sample-item-detail';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  if (!isTrustedRequestOrigin(request)) {
    return Response.json(
      { error: 'Untrusted request origin' },
      { status: 403 },
    );
  }

  const { photoId } = await params;
  const style = SAMPLE_PHOTOS[photoId];
  if (!style) {
    return Response.json({ error: 'Photo not found' }, { status: 404 });
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="${style.background}" />
  <text x="600" y="600" font-family="system-ui, sans-serif" font-size="52" font-weight="600" fill="${style.foreground}" text-anchor="middle" dominant-baseline="middle">${style.label}</text>
  <text x="600" y="668" font-family="system-ui, sans-serif" font-size="24" fill="${style.foreground}" opacity="0.6" text-anchor="middle" dominant-baseline="middle">Sample photo — no real image</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
