import { cookies } from 'next/headers';

import { buildEbayAuthorizationUrl, generateOauthState } from '@/server/ebay/ebay-oauth';

export const runtime = 'nodejs';

const STATE_COOKIE = 'ebay_oauth_state';

// GET, not POST -- this is a real navigation the owner clicks themselves
// ("Connect eBay account"), sending them to eBay's own consent screen.
// Never call this on the owner's behalf.
export async function GET() {
  const state = generateOauthState();
  let authorizationUrl: string;
  try {
    authorizationUrl = buildEbayAuthorizationUrl(state);
  } catch (error) {
    console.error(
      'Could not start the eBay OAuth flow',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Response.json(
      { error: error instanceof Error ? error.message : 'eBay is not configured' },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/ebay/oauth',
  });
  return Response.redirect(authorizationUrl, 307);
}
