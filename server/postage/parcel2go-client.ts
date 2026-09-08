/**
 * Talks directly to the same public, unauthenticated JSON endpoints
 * parcel2go.com's own quote-comparison page calls from the browser --
 * discovered by watching its network traffic live (2026-09-08), not a
 * documented partner API. No account, API key or OAuth needed; this is
 * the exact same data any anonymous visitor to the site gets. One
 * request per user-triggered "Get postage options" click (see
 * postgres-item-detail-repository.ts's fetchPostageOptions) -- resembles
 * a person checking prices for one parcel, never a bulk scrape, same
 * ethos as this app's eBay browser research.
 *
 * Deliberately not run through the Mac/Docker browser cascade used for
 * eBay research: unlike eBay, these endpoints have no login wall and no
 * anti-bot blocking to route around, so a plain fetch is simpler and
 * more reliable than driving a real browser for it.
 */

const API_BASE = 'https://www.parcel2go.com/.api';

export interface PostageQuote {
  courier: string;
  service: string;
  priceGbp: number;
  dropOff: boolean;
  locker: boolean;
  /** Neither a drop-off point nor a locker -- the courier collects from the given postcode instead. */
  collection: boolean;
  /** true unless the service explicitly offers printing in-store/no-printer-needed. */
  printerNeeded: boolean;
  estDeliveryDateMin?: string;
  estDeliveryDateMax?: string;
  maxWeightKg?: number;
}

export interface DropOffPoint {
  name: string;
  address: string;
  postcode: string;
  distanceMiles: number;
  isLocker: boolean;
  printInStoreAvailable: boolean;
  /** Human-readable carrier network names this location accepts drop-offs for, e.g. ["Royal Mail", "Evri"]. */
  networks: string[];
}

export interface GetPostageQuotesInput {
  originPostcode: string;
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

interface RawQuoteResponse {
  result: {
    tags?: string[];
    price: { gross: number };
    service: { name: string; courier: string };
    restrictions?: { maxWeight?: number };
    dates?: { delivery?: { dateMin?: string; dateMax?: string } }[];
  }[];
}

/** Same-day services need a live collection window this app has no way to offer -- excluded at the source rather than shown and never bookable. */
const EXCLUDED_TAGS = 'SameDay';

export async function getPostageQuotes(input: GetPostageQuotesInput): Promise<PostageQuote[]> {
  const params = new URLSearchParams({
    weight: input.weightKg.toFixed(2),
    quantity: '1',
    originPostcode: input.originPostcode,
    excludeTags: EXCLUDED_TAGS,
  });
  if (input.lengthCm !== undefined) params.set('length', String(input.lengthCm));
  if (input.widthCm !== undefined) params.set('width', String(input.widthCm));
  if (input.heightCm !== undefined) params.set('height', String(input.heightCm));

  const response = await fetch(`${API_BASE}/quoting/quote/shipments/GBR/GBR?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Parcel2Go quote request failed (${response.status})`);
  }
  const data = (await response.json()) as RawQuoteResponse;

  return data.result.map((row) => {
    const tags = row.tags ?? [];
    const dropOff = tags.includes('dropoff');
    const locker = tags.includes('locker');
    return {
      courier: row.service.courier,
      service: row.service.name,
      priceGbp: Math.round(row.price.gross) / 100,
      dropOff,
      locker,
      collection: !dropOff && !locker,
      printerNeeded: tags.includes('requiresprinter'),
      estDeliveryDateMin: row.dates?.[0]?.delivery?.dateMin,
      estDeliveryDateMax: row.dates?.[0]?.delivery?.dateMax,
      maxWeightKg: row.restrictions?.maxWeight,
    };
  });
}

interface GeoResponse {
  result: { latitude: number; longitude: number };
  success: boolean;
}

interface DropShopsResponse {
  result: { shops: Record<string, RawDropShop[]> };
}

interface RawDropShop {
  name: string;
  address1: string;
  postcode: string;
  distance: number;
  isLocker: boolean;
  printInStoreAvailable: boolean;
}

const NETWORK_LABEL: Record<string, string> = {
  'RM-PO': 'Royal Mail',
  ROYALMAIL: 'Royal Mail',
  MYHRMS: 'Evri',
  INPOST: 'InPost',
  DPD: 'DPD',
  PRCLFORCE: 'Parcelforce',
  FEDEX: 'FedEx',
  DHLSVCPNT: 'DHL',
  ACCESS: 'UPS Access Point',
  RELAY: 'Relay',
  COLLECT: 'Yodel / CollectPlus',
  PAYPOINT: 'PayPoint',
};

function networkLabel(key: string): string {
  return NETWORK_LABEL[key] ?? key;
}

const METRES_PER_MILE = 1609.344;
const MAX_DROP_OFF_POINTS = 8;

export async function getDropOffPoints(postcode: string): Promise<DropOffPoint[]> {
  const geoResponse = await fetch(
    `${API_BASE}/order-process/PARCEL2GO.UK.LIVE/order-process/address/geo/GBR?query=${encodeURIComponent(postcode)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!geoResponse.ok) {
    throw new Error(`Parcel2Go postcode lookup failed (${geoResponse.status})`);
  }
  const geo = (await geoResponse.json()) as GeoResponse;
  if (!geo.success) {
    throw new Error(`Parcel2Go could not locate postcode "${postcode}"`);
  }

  const shopsResponse = await fetch(
    `${API_BASE}/order-process/PARCEL2GO.UK.LIVE/order-process/dropshops/GBR/${geo.result.latitude}/${geo.result.longitude}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!shopsResponse.ok) {
    throw new Error(`Parcel2Go drop-off lookup failed (${shopsResponse.status})`);
  }
  const shopsData = (await shopsResponse.json()) as DropShopsResponse;

  // The same physical location is listed once per carrier network it
  // serves (e.g. a Post Office branch appears under both RM-PO and
  // ROYALMAIL, each with its own internal id) -- dedupe by name+postcode
  // so one real place shows once, with every network it accepts.
  const byLocation = new Map<string, DropOffPoint>();
  for (const [networkKey, shops] of Object.entries(shopsData.result.shops)) {
    for (const shop of shops) {
      const key = `${shop.name}|${shop.postcode}`;
      const existing = byLocation.get(key);
      if (existing) {
        if (!existing.networks.includes(networkLabel(networkKey))) {
          existing.networks.push(networkLabel(networkKey));
        }
        continue;
      }
      byLocation.set(key, {
        name: shop.name,
        address: shop.address1,
        postcode: shop.postcode,
        distanceMiles: Math.round((shop.distance / METRES_PER_MILE) * 10) / 10,
        isLocker: shop.isLocker,
        printInStoreAvailable: shop.printInStoreAvailable,
        networks: [networkLabel(networkKey)],
      });
    }
  }

  return [...byLocation.values()]
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, MAX_DROP_OFF_POINTS);
}
