/**
 * eBay app credentials and environment selection. EBAY_ENV defaults to
 * 'sandbox' deliberately -- a fresh setup should exercise the whole OAuth
 * + publish flow against eBay's sandbox (fake listings, fake money) before
 * ever pointing at production and touching a real seller account.
 */

export type EbayEnvironment = 'sandbox' | 'production';

function getEnvironment(): EbayEnvironment {
  return process.env.EBAY_ENV === 'production' ? 'production' : 'sandbox';
}

export interface EbayConfig {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiBase: string;
  authorizeBase: string;
  tokenUrl: string;
  marketplaceId: string;
}

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
] as const;

export function getEbayScopes(): string {
  return SCOPES.join(' ');
}

/**
 * Throws with a clear, actionable message rather than proceeding with
 * empty credentials -- every caller either surfaces this as "eBay isn't
 * connected yet" or lets it bubble up as a real error, never silently
 * no-ops against eBay's real API with blank auth.
 */
export function getEbayConfig(): EbayConfig {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const redirectUri = process.env.EBAY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'eBay is not configured -- set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_REDIRECT_URI',
    );
  }

  const environment = getEnvironment();
  return {
    environment,
    clientId,
    clientSecret,
    redirectUri,
    apiBase: environment === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com',
    authorizeBase:
      environment === 'production'
        ? 'https://auth.ebay.com/oauth2/authorize'
        : 'https://auth.sandbox.ebay.com/oauth2/authorize',
    tokenUrl:
      environment === 'production'
        ? 'https://api.ebay.com/identity/v1/oauth2/token'
        : 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
    // UK private seller, per BRIEF.md -- every quote/listing in this app
    // targets the UK marketplace, matching the postage feature's own
    // UK-only assumption.
    marketplaceId: 'EBAY_GB',
  };
}

/** Never throws -- for status checks/UI that just want to know if eBay is set up at all. */
export function isEbayConfigured(): boolean {
  try {
    getEbayConfig();
    return true;
  } catch {
    return false;
  }
}
