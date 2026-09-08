import assert from 'node:assert/strict';
import test from 'node:test';

import { getDropOffPoints, getPostageQuotes } from '../server/postage/parcel2go-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

void test('getPostageQuotes maps tags into dropOff/locker/collection/printerNeeded flags', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return jsonResponse({
      result: [
        {
          tags: ['printinstore', 'dropoff'],
          price: { gross: 239 },
          service: { name: 'Evri ParcelShop', courier: 'Evri Drop-off' },
          restrictions: { maxWeight: 15 },
          dates: [{ delivery: { dateMin: '2026-09-10T00:00:00Z', dateMax: '2026-09-11T00:00:00Z' } }],
        },
        {
          tags: ['locker'],
          price: { gross: 323 },
          service: { name: 'InPost Lockers to Home', courier: 'InPost' },
        },
        {
          tags: ['requiresprinter'],
          price: { gross: 396 },
          service: { name: 'Evri Collection', courier: 'Evri Collection' },
        },
      ],
    });
  }) as typeof fetch;

  try {
    const quotes = await getPostageQuotes({ originPostcode: 'OX12 0DD', weightKg: 0.25 });
    assert.equal(quotes.length, 3);
    assert.deepEqual(
      { dropOff: quotes[0]!.dropOff, locker: quotes[0]!.locker, collection: quotes[0]!.collection },
      { dropOff: true, locker: false, collection: false },
    );
    assert.equal(quotes[0]!.priceGbp, 2.39);
    assert.deepEqual(
      { dropOff: quotes[1]!.locker, collection: quotes[1]!.collection },
      { dropOff: true, collection: false },
    );
    assert.deepEqual(
      { dropOff: quotes[2]!.dropOff, locker: quotes[2]!.locker, collection: quotes[2]!.collection },
      { dropOff: false, locker: false, collection: true },
    );
    assert.equal(quotes[0]!.printerNeeded, false);
    assert.equal(quotes[2]!.printerNeeded, true);
    assert.ok(calls[0]!.includes('originPostcode=OX12'));
    assert.ok(calls[0]!.includes('weight=0.25'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test('getPostageQuotes throws a clear error on a non-ok response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({}, false, 502)) as typeof fetch;
  try {
    await assert.rejects(() => getPostageQuotes({ originPostcode: 'OX12 0DD', weightKg: 1 }), /502/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test('getDropOffPoints geocodes the postcode, then dedupes the same location across networks', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const urlString = String(url);
    if (urlString.includes('/address/geo/')) {
      return jsonResponse({ result: { latitude: 51.6, longitude: -1.4 }, success: true });
    }
    return jsonResponse({
      result: {
        shops: {
          'RM-PO': [
            { name: 'Grove Post Office', address1: '1 High St', postcode: 'OX12 0PT', distance: 680, isLocker: false, printInStoreAvailable: true },
          ],
          ROYALMAIL: [
            { name: 'Grove Post Office', address1: '1 High St', postcode: 'OX12 0PT', distance: 680, isLocker: false, printInStoreAvailable: true },
          ],
          INPOST: [
            { name: 'InPost Locker Grove', address1: 'Unit 1', postcode: 'OX12 0PT', distance: 328, isLocker: true, printInStoreAvailable: false },
          ],
        },
      },
    });
  }) as typeof fetch;

  try {
    const points = await getDropOffPoints('OX12 0DD');
    assert.equal(points.length, 2);
    assert.equal(points[0]!.name, 'InPost Locker Grove');
    assert.ok(points[0]!.distanceMiles < points[1]!.distanceMiles);
    const grovePostOffice = points.find((point) => point.name === 'Grove Post Office');
    assert.deepEqual(grovePostOffice?.networks.sort(), ['Royal Mail']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test('getDropOffPoints throws when the postcode cannot be located', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({ result: null, success: false })) as typeof fetch;
  try {
    await assert.rejects(() => getDropOffPoints('NOT A POSTCODE'), /could not locate/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
