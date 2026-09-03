# eBay capability reconnaissance

Date: 2026-09-03

This is an initial official-source pass. It does not replace authenticated UK account inspection or a Sandbox proof.

## Findings

### Sold/comparable research

- eBay's [Product Research](https://www.ebay.co.uk/help/selling/selling-tools/product-research?id=4853) exposes up to three years of sales data, actual accepted Best Offer prices, price ranges and shipping costs. The UK Seller Centre says it is available under Seller Hub's Research tab and in the mobile app.
- The public [Browse API](https://developer.ebay.com/develop/api/buy) is an active shopping/search interface (keyword, category, GTIN, product and image search). Its published endpoints do not provide historical sold/completed results.
- Initial conclusion: Browse API is useful for active-market supply and identification, but authenticated Product Research/browser evidence is the strongest known route for historical achieved prices. This must be confirmed in the user's account.

### Listing creation

- The [Inventory API](https://developer.ebay.com/api-docs/sell/inventory/static/overview.html) models inventory locations, SKU-keyed inventory items and offers that become listings when published. It supports fixed-price and auction listings.
- Publishing requires the seller to be opted into business policies and each offer to reference payment, fulfilment and return policies.
- Important restriction: listings created through Inventory API cannot be edited through Seller Hub or another listing platform; revisions must remain in Inventory API. This makes operational ownership a major publishing-strategy decision rather than an implementation detail.
- Scheduled listings are supported through `listingStartDate`, according to the official [Inventory API release notes](https://developer.ebay.com/api-docs/sell/inventory/static/release-notes-archive.html).
- Expected fees for up to 250 unpublished offers can be requested with `getListingFees`; the [official guide](https://developer.ebay.com/api-docs/sell/static/inventory/expected-listing-fees.html) notes results are grouped by marketplace rather than attributed per offer.

### Authentication and fulfilment

- User-owned data/actions require an OAuth authorization-code grant and consent; application-only data may use client credentials. See eBay's [authorization guide](https://developer.ebay.com/develop/guides/sell/authorization).
- The authorization grant returns a refresh token so normal operation need not repeatedly ask for consent. Tokens and client secrets must remain in server-side secret storage.
- The [Fulfillment API](https://developer.ebay.com/develop/api/sell/fulfillment_api) provides checked-out orders and shipment fulfilment/tracking. It excludes pending-payment purchases that require upfront payment.

## Working strategy

1. Use API metadata/taxonomy and active Browse searches where coverage is reliable.
2. Use authenticated Product Research for deep comparable evidence unless account inspection reveals a supported API with equivalent achieved-price data.
3. Prototype Inventory API publication only after confirming the user's seller account/business-policy eligibility and accepting the API-ownership restriction.
4. Keep browser publication viable because Seller Hub may be more compatible with the user's normal manual editing workflow.
5. Keep all mechanisms behind `ComparableSalesProvider` and `MarketplacePublisher` ports; mechanism never changes approval requirements.

## Next verification

- Inspect the user's authenticated eBay UK Seller Hub and Product Research availability.
- Compare Sold/Completed search's visible fields and history window with Product Research.
- Confirm auction and schedule behavior for the relevant UK account/category mix.
- Confirm Inventory API eligibility, photo handling, category aspects and revision limitations in Sandbox.
- Inspect Finances API coverage for actual fees/payout reconciliation.
