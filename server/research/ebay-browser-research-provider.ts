import type {
  BrowserSoldListing,
  ComparableSalesBrowserProvider,
  ComparableSalesBrowserResult,
} from './comparable-sales-browser-provider';

interface SessionResponse {
  state: string;
}

interface SoldListingsResponse {
  query: string;
  url: string;
  items: BrowserSoldListing[];
}

/**
 * Calls sell-browser's HTTP API (see that repo's README) rather than
 * driving a browser itself -- this app never touches Playwright/CDP
 * directly, per ADR 0005's "expose only a narrow deterministic action
 * API" boundary. Claims the shared session only when it's actually idle,
 * and always releases what it claimed, success or failure, so a stuck
 * claim here can't block the noVNC human-takeover path or a future
 * concurrent caller.
 */
export class EbayBrowserResearchProvider implements ComparableSalesBrowserProvider {
  constructor(private readonly baseUrl: string) {}

  async fetchSoldListings(keywords: string): Promise<ComparableSalesBrowserResult> {
    let claimedByUs = false;
    try {
      const sessionResponse = await fetch(`${this.baseUrl}/session`);
      if (!sessionResponse.ok) {
        return {
          outcome: 'unavailable',
          reason: `sell-browser /session returned ${sessionResponse.status}`,
        };
      }
      const { state } = (await sessionResponse.json()) as SessionResponse;

      if (state === 'IDLE') {
        const claimResponse = await fetch(`${this.baseUrl}/session/agent-claim`, {
          method: 'POST',
        });
        if (!claimResponse.ok) {
          return {
            outcome: 'unavailable',
            reason: `Could not claim the browser session (${claimResponse.status})`,
          };
        }
        claimedByUs = true;
      } else if (state !== 'AGENT_CONTROLLED') {
        return {
          outcome: 'unavailable',
          reason: `Browser session is ${state}, not available for automated research`,
        };
      }

      const searchResponse = await fetch(`${this.baseUrl}/research/sold-listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      });
      if (!searchResponse.ok) {
        const body = (await searchResponse.json().catch(() => ({}))) as { error?: string };
        return {
          outcome: 'unavailable',
          reason: body.error ?? `sell-browser search returned ${searchResponse.status}`,
        };
      }
      const data = (await searchResponse.json()) as SoldListingsResponse;
      return { outcome: 'succeeded', query: data.query, url: data.url, sales: data.items };
    } catch (error) {
      return {
        outcome: 'unavailable',
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (claimedByUs) {
        await fetch(`${this.baseUrl}/session/release`, { method: 'POST' }).catch(() => undefined);
      }
    }
  }
}

const sharedProviders = new Map<string, EbayBrowserResearchProvider>();

/** Undefined when the given env var isn't configured -- callers treat that the same as any other "unavailable" outcome and fall back to the next tier. */
function providerFromEnv(envVar: string): EbayBrowserResearchProvider | undefined {
  const baseUrl = process.env[envVar];
  if (!baseUrl) return undefined;
  const existing = sharedProviders.get(envVar);
  if (existing) return existing;
  const provider = new EbayBrowserResearchProvider(baseUrl);
  sharedProviders.set(envVar, provider);
  return provider;
}

/** sell-browser-mac: the real Chrome on an always-on Mac -- see that project's README. Tried first (see research-comparable-sales-job.ts's cascade doc comment). */
export function getMacBrowserResearchProvider(): EbayBrowserResearchProvider | undefined {
  return providerFromEnv('SELL_BROWSER_MAC_BASE_URL');
}

/** sell-browser: the Docker/Xvfb Chromium fallback. */
export function getEbayBrowserResearchProvider(): EbayBrowserResearchProvider | undefined {
  return providerFromEnv('SELL_BROWSER_BASE_URL');
}
