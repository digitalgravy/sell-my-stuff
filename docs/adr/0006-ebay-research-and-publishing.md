# ADR 0006: eBay research and publishing strategy

- Status: Research required
- Date: 2026-09-03

## Context

Valuation needs real sold evidence and publication needs reliable coverage of eBay UK fields, scheduling and verification.

## Direction

Keep `ComparableSalesProvider` and `MarketplacePublisher` abstractions independent of mechanism. Prefer authoritative APIs when they provide the necessary evidence/action, authenticated browser workflows where the customer UI is richer, and a hybrid when that is more reliable. Persist provenance and marketplace IDs regardless.

## Decision gate

Accept only after current API documentation and the user's authenticated eBay UK surfaces (Sold/Completed, Seller Hub and Product Research) have been inspected.

Initial official-source findings are recorded in `docs/research/ebay-capabilities-2026-09-03.md`. They favour Product Research/browser access for historical achieved prices and identify a significant Inventory API restriction: API-created listings remain API-managed rather than Seller Hub-editable.
