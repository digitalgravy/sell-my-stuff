import assert from 'node:assert/strict';
import test from 'node:test';

import { EbayBrowserResearchProvider } from '../server/research/ebay-browser-research-provider';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function withStubbedFetch(
  handler: (input: string, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    handler(requestUrl(input), init)) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

void test('EbayBrowserResearchProvider claims an idle session, searches, then releases', async () => {
  const calls: string[] = [];
  await withStubbedFetch(
    async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/session')) return jsonResponse(200, { state: 'IDLE' });
      if (url.endsWith('/session/agent-claim')) return jsonResponse(200, { state: 'AGENT_CONTROLLED' });
      if (url.endsWith('/research/sold-listings')) {
        return jsonResponse(200, {
          query: 'Apple HomePod mini',
          url: 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple+HomePod+mini',
          items: [{ title: 'Apple HomePod mini', match: 'Pre-owned', soldAt: '2026-09-01', price: 45 }],
        });
      }
      if (url.endsWith('/session/release')) return jsonResponse(200, { state: 'IDLE' });
      throw new Error(`Unexpected fetch: ${url}`);
    },
    async () => {
      const provider = new EbayBrowserResearchProvider('https://sell-browser.test');
      const result = await provider.fetchSoldListings('Apple HomePod mini');
      assert.deepEqual(result, {
        outcome: 'succeeded',
        query: 'Apple HomePod mini',
        url: 'https://www.ebay.co.uk/sch/i.html?_nkw=Apple+HomePod+mini',
        sales: [{ title: 'Apple HomePod mini', match: 'Pre-owned', soldAt: '2026-09-01', price: 45 }],
      });
      assert.deepEqual(calls, [
        'GET https://sell-browser.test/session',
        'POST https://sell-browser.test/session/agent-claim',
        'POST https://sell-browser.test/research/sold-listings',
        'POST https://sell-browser.test/session/release',
      ]);
    },
  );
});

void test('EbayBrowserResearchProvider skips claiming when the session is already agent-controlled, and does not release afterward', async () => {
  const calls: string[] = [];
  await withStubbedFetch(
    async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/session')) return jsonResponse(200, { state: 'AGENT_CONTROLLED' });
      if (url.endsWith('/research/sold-listings')) {
        return jsonResponse(200, { query: 'q', url: 'https://example.com', items: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    },
    async () => {
      const provider = new EbayBrowserResearchProvider('https://sell-browser.test');
      const result = await provider.fetchSoldListings('q');
      assert.equal(result.outcome, 'succeeded');
      assert.deepEqual(calls, [
        'GET https://sell-browser.test/session',
        'POST https://sell-browser.test/research/sold-listings',
      ]);
    },
  );
});

void test('EbayBrowserResearchProvider reports unavailable, not an error, when the session needs a human', async () => {
  await withStubbedFetch(
    async (url) => {
      if (url.endsWith('/session')) return jsonResponse(200, { state: 'WAITING_FOR_HUMAN' });
      throw new Error(`Unexpected fetch: ${url}`);
    },
    async () => {
      const provider = new EbayBrowserResearchProvider('https://sell-browser.test');
      const result = await provider.fetchSoldListings('q');
      assert.equal(result.outcome, 'unavailable');
      if (result.outcome === 'unavailable') {
        assert.match(result.reason, /WAITING_FOR_HUMAN/);
      }
    },
  );
});

void test('EbayBrowserResearchProvider reports unavailable, and still releases its claim, when the search comes back blocked', async () => {
  const calls: string[] = [];
  await withStubbedFetch(
    async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/session')) return jsonResponse(200, { state: 'IDLE' });
      if (url.endsWith('/session/agent-claim')) return jsonResponse(200, { state: 'AGENT_CONTROLLED' });
      if (url.endsWith('/research/sold-listings')) {
        return jsonResponse(502, { error: 'Search page looks blocked' });
      }
      if (url.endsWith('/session/release')) return jsonResponse(200, { state: 'IDLE' });
      throw new Error(`Unexpected fetch: ${url}`);
    },
    async () => {
      const provider = new EbayBrowserResearchProvider('https://sell-browser.test');
      const result = await provider.fetchSoldListings('q');
      assert.equal(result.outcome, 'unavailable');
      if (result.outcome === 'unavailable') {
        assert.equal(result.reason, 'Search page looks blocked');
      }
      assert.ok(calls.includes('POST https://sell-browser.test/session/release'));
    },
  );
});

void test('EbayBrowserResearchProvider reports unavailable when the service is unreachable', async () => {
  await withStubbedFetch(
    async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    },
    async () => {
      const provider = new EbayBrowserResearchProvider('https://sell-browser.test');
      const result = await provider.fetchSoldListings('q');
      assert.equal(result.outcome, 'unavailable');
      if (result.outcome === 'unavailable') {
        assert.match(result.reason, /ECONNREFUSED/);
      }
    },
  );
});
