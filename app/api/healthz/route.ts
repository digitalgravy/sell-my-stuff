export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { status: 'ok', service: 'sell-my-stuff' },
    { status: 200 },
  );
}
