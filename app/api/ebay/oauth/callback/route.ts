import { cookies } from 'next/headers';

import { exchangeEbayAuthorizationCode } from '@/server/ebay/ebay-oauth';

export const runtime = 'nodejs';

const STATE_COOKIE = 'ebay_oauth_state';

// eBay redirects the owner's own browser here after they grant (or deny)
// consent on eBay's own consent screen -- never navigated to programmatically.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  const redirectTo = (message?: string) => {
    const target = new URL('/items', url.origin);
    if (message) target.searchParams.set('ebay_error', message);
    return Response.redirect(target, 307);
  };

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectTo('eBay sign-in could not be verified -- try connecting again.');
  }

  try {
    await exchangeEbayAuthorizationCode(code);
  } catch (error) {
    console.error(
      'Could not complete the eBay OAuth flow',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return redirectTo('Could not finish connecting your eBay account -- try again.');
  }

  return Response.redirect(new URL('/items?ebay_connected=1', url.origin), 307);
}
