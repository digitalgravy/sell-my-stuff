import { isEbayConfigured } from '@/server/ebay/ebay-config';
import { isEbayConnected } from '@/server/ebay/ebay-oauth';

export const runtime = 'nodejs';

export async function GET() {
  const configured = isEbayConfigured();
  const connected = configured ? await isEbayConnected() : false;
  return Response.json({ configured, connected });
}
