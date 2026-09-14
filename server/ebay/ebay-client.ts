import { getEbayConfig } from './ebay-config';
import { getValidEbayAccessToken } from './ebay-oauth';

export class EbayApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`eBay ${method} ${path} failed (${status}): ${body}`);
  }
}

async function ebayFetch<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const config = getEbayConfig();
  const accessToken = await getValidEbayAccessToken();
  const url = new URL(`${config.apiBase}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-GB',
      'Accept-Language': 'en-GB',
      'X-EBAY-C-MARKETPLACE-ID': config.marketplaceId,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new EbayApiError(method, path, response.status, text);
  }
  // A 204 (common for the inventory-item PUT) has no body to parse.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface EbayInventoryItemInput {
  sku: string;
  condition: string;
  conditionDescription?: string;
  title: string;
  description: string;
  aspects: Record<string, string[]>;
  imageUrls: string[];
  quantity: number;
}

/** PUT is idempotent by design here -- publishing a listing draft twice just replaces the same inventory item record, never creates a duplicate. */
export async function createOrReplaceInventoryItem(input: EbayInventoryItemInput): Promise<void> {
  await ebayFetch('PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(input.sku)}`, {
    body: {
      condition: input.condition,
      conditionDescription: input.conditionDescription,
      product: {
        title: input.title,
        description: input.description,
        aspects: input.aspects,
        imageUrls: input.imageUrls,
      },
      availability: {
        shipToLocationAvailability: { quantity: input.quantity },
      },
    },
  });
}

export interface EbayCreateOfferInput {
  sku: string;
  categoryId: string;
  priceGbp: number;
  // Dispatch time isn't a per-offer field -- it comes from the
  // fulfillment policy's own handling-time setting, set up once via My
  // eBay alongside the policy itself.
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
}

export async function createOffer(input: EbayCreateOfferInput): Promise<{ offerId: string }> {
  return ebayFetch<{ offerId: string }>('POST', '/sell/inventory/v1/offer', {
    body: {
      sku: input.sku,
      marketplaceId: getEbayConfig().marketplaceId,
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      categoryId: input.categoryId,
      listingPolicies: {
        fulfillmentPolicyId: input.fulfillmentPolicyId,
        paymentPolicyId: input.paymentPolicyId,
        returnPolicyId: input.returnPolicyId,
      },
      pricingSummary: {
        price: { value: input.priceGbp.toFixed(2), currency: 'GBP' },
      },
      merchantLocationKey: input.merchantLocationKey,
    },
  });
}

/** The one call with real, live consequences -- the offer goes on sale on eBay the moment this succeeds. Every caller must reach this only from an explicit, human-approved publish action. */
export async function publishOffer(offerId: string): Promise<{ listingId: string }> {
  return ebayFetch<{ listingId: string }>(
    'POST',
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish/`,
  );
}

interface CategoryTreeIdResponse {
  categoryTreeId: string;
}

let cachedCategoryTreeId: string | undefined;

async function getCategoryTreeId(): Promise<string> {
  if (cachedCategoryTreeId) return cachedCategoryTreeId;
  const config = getEbayConfig();
  const result = await ebayFetch<CategoryTreeIdResponse>(
    'GET',
    '/commerce/taxonomy/v1/get_default_category_tree_id',
    { query: { marketplace_id: config.marketplaceId } },
  );
  cachedCategoryTreeId = result.categoryTreeId;
  return result.categoryTreeId;
}

export interface EbayCategorySuggestion {
  categoryId: string;
  categoryName: string;
}

interface CategorySuggestionsResponse {
  categorySuggestions?: {
    category: { categoryId: string; categoryName: string };
  }[];
}

/** Suggests real eBay category IDs for a free-text query (the listing draft's own title works well) -- createOffer needs a real numeric categoryId, never the AI's human-readable categoryGuess directly. */
export async function getCategorySuggestions(query: string): Promise<EbayCategorySuggestion[]> {
  const treeId = await getCategoryTreeId();
  const result = await ebayFetch<CategorySuggestionsResponse>(
    'GET',
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_suggestions`,
    { query: { q: query } },
  );
  return (result.categorySuggestions ?? []).map((entry) => ({
    categoryId: entry.category.categoryId,
    categoryName: entry.category.categoryName,
  }));
}

interface EbayPolicy {
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  name: string;
}

async function getPolicies<T extends EbayPolicy>(
  path: string,
  responseKey: string,
): Promise<T[]> {
  const config = getEbayConfig();
  const result = await ebayFetch<Record<string, T[]>>('GET', path, {
    query: { marketplace_id: config.marketplaceId },
  });
  return result[responseKey] ?? [];
}

/**
 * Business Policies (fulfillment/payment/return) are opted into and
 * created once via My eBay itself (self-service, a few minutes -- see
 * BRIEF.md's eBay-integration research), not by this app. Rather than
 * hardcoding which policy to use, this fetches whatever the seller has
 * already set up and uses the first of each -- reasonable for a single
 * private seller with one policy of each kind.
 */
export async function getFirstBusinessPolicies(): Promise<{
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
} | null> {
  const [fulfillment, payment, returns] = await Promise.all([
    getPolicies<EbayPolicy>('/sell/account/v1/fulfillment_policy', 'fulfillmentPolicies'),
    getPolicies<EbayPolicy>('/sell/account/v1/payment_policy', 'paymentPolicies'),
    getPolicies<EbayPolicy>('/sell/account/v1/return_policy', 'returnPolicies'),
  ]);
  const fulfillmentPolicyId = fulfillment[0]?.fulfillmentPolicyId;
  const paymentPolicyId = payment[0]?.paymentPolicyId;
  const returnPolicyId = returns[0]?.returnPolicyId;
  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) return null;
  return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
}

interface MerchantLocation {
  merchantLocationKey: string;
}

/** The first configured inventory-location key -- needed on every offer; set up once via My eBay/Account API alongside Business Policies. */
export async function getFirstMerchantLocationKey(): Promise<string | null> {
  const result = await ebayFetch<{ locations?: MerchantLocation[] }>(
    'GET',
    '/sell/inventory/v1/location',
  );
  return result.locations?.[0]?.merchantLocationKey ?? null;
}
