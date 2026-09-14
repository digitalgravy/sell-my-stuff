/**
 * BRIEF.md's marketplace publishing abstraction:
 *
 *   MarketplacePublisher
 *   ├── EbayApiPublisher
 *   └── EbayBrowserPublisher (not built -- the API path covers this app's
 *       needs; see the eBay-integration research in the Listing tab's
 *       Build log for why browser automation wasn't chosen for publishing)
 *
 * Every implementation's `publish` is the one call with real, live
 * consequences -- it must only ever be invoked from an explicit,
 * human-approved action for that specific listing, never automatically.
 */
export type PublishListingOutcome =
  | { ok: true; listingId: string; listingUrl: string }
  | { ok: false; reason: string };

/**
 * Everything a publisher needs to actually list an item -- assembled by
 * the repository from listing/identity/condition/pricing facts, the
 * same way ListingDraftInput feeds the AI listing-draft provider. Keeps
 * every publisher itself free of direct DB access, so its own payload
 * construction can be tested with a plain object.
 */
export interface PublishListingInput {
  /** Stable per-item identifier used as the marketplace SKU -- the item's own id. */
  sku: string;
  title: string;
  description: string;
  conditionGrade: string;
  conditionDescription: string;
  itemSpecifics: { brand?: string; model?: string; colour?: string; type?: string };
  priceGbp: number;
  /** Absolute, publicly-fetchable URLs, hero photo first -- marketplaces fetch these themselves, never receive an upload. */
  photoUrls: string[];
}

export interface MarketplacePublisher {
  readonly marketplace: string;
  publish(input: PublishListingInput): Promise<PublishListingOutcome>;
}
