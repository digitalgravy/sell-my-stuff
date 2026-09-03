# eBay capability reconnaissance

Date: 2026-09-03

This combines an official-source pass with a read-only authenticated UK account inspection. It does not replace a Sandbox API proof.

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

## Authenticated UK UI findings

The user's existing session opened Seller Hub without reauthentication. No credentials or session data were copied or stored.

- Product Research is available at `/sh/research`, defaults to marketplace `EBAY-UK`, the Sold tab and a 30-day window.
- The keyword field accepts keywords, MPN, UPC, EPID, EAN or ISBN. Visible filters include category, condition, format, price, top-rated status and additional filters.
- Results expose aggregate average sold price, sold-price range, average postage, free-postage rate, sell-through, seller count and time-series charts.
- Result rows expose title, average sold price, format, average postage, units sold, item sales, bids and last-sold date. The UI offers 10/20/50 rows per page.
- A harmless A2520 keyboard query confirmed why matching must be deterministic: results mixed colour, layout, condition, bundles and defective examples despite a specific model query.
- Regular Sold + Completed search remains available and exposes public item cards, visible sold date, condition, displayed price, sale format, postage and a “Best Offer accepted” marker. Product Research is richer because it supplies actual accepted-offer values and aggregate metrics rather than only the public card's struck/displayed price.
- Seller Hub currently indicates the account needs some account-detail updates before listing again. Publication eligibility must therefore be treated as unresolved until those requirements and business policies are checked deliberately.

## Next verification

- Determine the available Product Research date-window controls and durable extraction approach.
- Confirm auction and schedule behavior for the relevant UK account/category mix.
- Confirm Inventory API eligibility, photo handling, category aspects and revision limitations in Sandbox.
- Inspect Finances API coverage for actual fees/payout reconciliation.
