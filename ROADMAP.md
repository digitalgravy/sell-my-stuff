# Roadmap

This roadmap preserves completed history. Items move between sections as evidence changes.

## Now

- [ ] Milestone 0: complete repository, CI, documentation, security and Overseer deployment foundations.
- [ ] Milestone 1: deliver a real photo-to-draft vertical slice with durable server state.
- [x] Define the PostgreSQL item/photo/job schema, migration and feature-gated upload contract.
- [ ] Provision PostgreSQL and durable upload storage through Overseer, then enable and integration-test capture.
- [ ] Establish mobile capture quality: multi-photo, HEIC, drag/drop, clipboard, retries and clear progress.
- [x] Establish the evidence/confidence model before any AI-generated fact reaches a listing.
  - `item_facts` table (value/confidence/origin/evidence/source/retrieval
    timestamp/user-confirmed) plus the first schema-validated producer,
    `AnthropicVisionProvider` → `runInspectImagesJob`. One current row per
    field so far, not a full historical ledger.
- [ ] Research current eBay API and authenticated UI capabilities; record research and publishing ADRs.
- [ ] Convert HEIC/HEIF photos to JPEG/PNG before vision inspection (Claude
      vision does not accept HEIC/HEIF; currently a clear, caught error).
- [ ] Replace the illustrative "3 things need you" / "Working in the
      background" queue data with real items and `identity.open_questions` facts.

## Next

- [ ] Milestone 2: persistent Browser Operator on Jupiter/Docker infrastructure with secure human takeover.
- [ ] Milestone 3: comparable cache, scoring and deterministic valuation.
- [ ] Realtime cross-device progress with revision-safe updates.
- [ ] PWA installation and offline-tolerant capture queue.
- [ ] Complete sale proposal covering condition, photos, fees, shipping and packaging.

## Later

- [ ] eBay publishing through the best verified API/browser hybrid, behind feature flags and exact-proposal approval.
- [ ] Offer, order, packing, postage, tracking and proceeds lifecycle.
- [ ] Packaging inventory and purchase proposals.
- [ ] Bundle recommendations and effort-adjusted selling strategy.
- [ ] Broader marketplace, carrier and AI-provider adapters.

## Ideas / parking lot

- [ ] PWA push notifications for meaningful interruptions only.
- [ ] Share-sheet ingestion.
- [ ] Local model routing for cheap/private classification tasks.
- [ ] Restore-tested encrypted backups for item evidence and browser profile data.
- [ ] Sale-outcome feedback to calibrate valuation models.

## Explicitly out of scope

- High-volume scraping or marketplace abuse.
- CAPTCHA bypass, fingerprint spoofing, proxy rotation or anti-bot circumvention.
- Unapproved financial, contractual or publication actions.
- Native iOS application unless PWA constraints prove material.
- General-purpose inventory-management or enterprise ERP workflows.
- Sending credentials, cookies or browser profiles to an LLM provider.
