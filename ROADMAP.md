# Roadmap

This roadmap preserves completed history. Items move between sections as evidence changes.

## Now

- [ ] Milestone 0: complete repository, CI, documentation, security and Overseer deployment foundations.
- [ ] Milestone 1: deliver a real photo-to-draft vertical slice with durable server state.
- [ ] Establish mobile capture quality: multi-photo, HEIC, drag/drop, clipboard, retries and clear progress.
- [ ] Establish the evidence/confidence model before any AI-generated fact reaches a listing.
- [ ] Research current eBay API and authenticated UI capabilities; record research and publishing ADRs.

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
