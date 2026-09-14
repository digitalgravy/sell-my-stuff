import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { marketplaceOauthTokens } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import { getEbayConfig, getEbayScopes } from './ebay-config';

const MARKETPLACE = 'ebay';
// Refresh a little before the token actually expires so a request never
// races a token that's valid when checked but expired by the time it's
// used.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * The URL to send the owner to for the one-time (well, roughly
 * 18-month-recurring, per eBay's refresh-token lifetime) live consent
 * step -- only ever reached by the owner clicking a real "Connect eBay
 * account" link themselves, never navigated to on their behalf.
 *
 * `redirect_uri` here is eBay's "RuName" -- a redirect name registered in
 * the developer portal against a real callback URL, not the callback URL
 * itself -- see EBAY_REDIRECT_URI's own setup notes.
 */
export function buildEbayAuthorizationUrl(state: string): string {
  const config = getEbayConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: getEbayScopes(),
    state,
  });
  return `${config.authorizeBase}?${params}`;
}

interface EbayTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type: string;
}

async function requestToken(body: URLSearchParams): Promise<EbayTokenResponse> {
  const config = getEbayConfig();
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`eBay token request failed (${response.status}): ${text}`);
  }
  return (await response.json()) as EbayTokenResponse;
}

/** Exchanges the one-time authorization code from the OAuth callback for tokens, and stores them. */
export async function exchangeEbayAuthorizationCode(code: string): Promise<void> {
  const config = getEbayConfig();
  const tokens = await requestToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
  );
  if (!tokens.refresh_token) {
    throw new Error('eBay did not return a refresh token for this authorization code');
  }
  await saveTokens(tokens.access_token, tokens.expires_in, tokens.refresh_token);
}

async function saveTokens(
  accessToken: string,
  expiresInSeconds: number,
  refreshToken: string,
): Promise<void> {
  const database = getDatabase();
  const accessTokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const scope = getEbayScopes();
  const updatedAt = new Date();
  await database
    .insert(marketplaceOauthTokens)
    .values({ marketplace: MARKETPLACE, accessToken, refreshToken, accessTokenExpiresAt, scope, updatedAt })
    .onConflictDoUpdate({
      target: marketplaceOauthTokens.marketplace,
      set: { accessToken, refreshToken, accessTokenExpiresAt, scope, updatedAt },
    });
}

export async function isEbayConnected(): Promise<boolean> {
  const database = getDatabase();
  const [row] = await database
    .select({ marketplace: marketplaceOauthTokens.marketplace })
    .from(marketplaceOauthTokens)
    .where(eq(marketplaceOauthTokens.marketplace, MARKETPLACE));
  return !!row;
}

/** Returns a currently-valid access token, refreshing first if it's expired or close to it. Throws if eBay has never been connected. */
export async function getValidEbayAccessToken(): Promise<string> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(marketplaceOauthTokens)
    .where(eq(marketplaceOauthTokens.marketplace, MARKETPLACE));
  if (!row) {
    throw new Error('eBay is not connected -- connect it before publishing');
  }

  const needsRefresh = row.accessTokenExpiresAt.getTime() - REFRESH_MARGIN_MS < Date.now();
  if (!needsRefresh) return row.accessToken;

  const refreshed = await requestToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refreshToken,
      scope: getEbayScopes(),
    }),
  );
  await saveTokens(
    refreshed.access_token,
    refreshed.expires_in,
    // A refresh grant doesn't always return a new refresh token -- keep
    // the existing one unless eBay actually issued a new one.
    refreshed.refresh_token ?? row.refreshToken,
  );
  return refreshed.access_token;
}

/** A short opaque token to pair the authorization redirect with its callback -- not a session id, just CSRF protection for the OAuth round trip. */
export function generateOauthState(): string {
  return randomUUID();
}
