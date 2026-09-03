# Project status

Last updated: 2026-09-03

## Current phase

Milestone 0 foundations are merged. Milestone 1 now has a server-owned capture
contract, but production persistence remains safely disabled until its
infrastructure is provisioned.

- Branch: `codex/item-persistence`
- Current PR: not yet opened
- Current production version: not deployed
- Last known-good `main`: `40966a2` (merged Gitea PR #1)

## In progress

- [ ] Complete Milestone 0 deployment foundations
  - [x] Responsive application, design tokens and multi-photo capture UI
  - [x] Standard self-hosted Next.js Node runtime and standalone image
  - [x] Docker/Overseer manifest and Gitea workflow
  - [x] Gitea PR #1 merged to `main`
  - [ ] Configure registry Actions secrets and verify the workflow/container
  - [ ] Create and approve the first Overseer container, DNS and proxy proposals
- [ ] Milestone 1 vertical slice: photo → draft item
  - [x] Camera/file picker, multiple images, drag/drop and clipboard input
  - [x] PostgreSQL item/photo/job schema and generated migration
  - [x] Byte-verified HEIC/JPEG/PNG upload with size/count limits
  - [x] Durable object-store boundary and compensating cleanup
  - [x] Atomic item metadata plus idempotent `inspect_images` job creation
  - [x] Feature-gated API wired to truthful UI success/error states
  - [ ] Provision and integration-test PostgreSQL plus durable upload storage
  - [ ] Implement the worker and real vision-provider adapter
  - [ ] Research stage and evidence model

## Blocked

- [ ] First infrastructure deployment
  - Blocker: Overseer must propose and apply real PostgreSQL, storage, container,
    DNS and reverse-proxy changes; no reusable database/object service was found.
  - Next action: prepare the exact Overseer proposals and migration procedure.

## Next up

- [ ] Provision isolated PostgreSQL and a backed-up upload volume through Overseer.
- [ ] Run the migration and real database/filesystem integration test.
- [ ] Enable `CAPTURE_API_ENABLED` only after both dependencies are healthy.
- [ ] Implement resumable `inspect_images` job claiming and retries.
- [ ] Add the vision adapter, schema validation and evidence/confidence records.
- [ ] Decide the production identity boundary after checking trusted-device conventions.
- [ ] Add component, accessibility and mobile E2E coverage for capture.

## Recently completed

- [x] Merged foundations PR #1 at `40966a2`.
- [x] Replaced the Cloudflare-oriented prototype runtime with standard Next.js
      self-hosting so the app can use Postgres and durable local storage.
- [x] Added Drizzle schema and migration for items, photos and jobs.
- [x] Added upload validation based on file signatures, not user-supplied names.
- [x] Added unit and API contract coverage for storage, rollback and feature gates.
- [x] Recorded the first storage decision in accepted ADR 0002.
- [x] Completed official-source and authenticated eBay research reconnaissance.

## Known bugs

- [ ] Production capture returns a clear 503 until persistence infrastructure is ready.
- [ ] Navigation, metrics and sample task rows are illustrative and not API-backed.
- [ ] WebMCP registration is feature-detected but not contract-tested in a supported host.

## Technical debt

- [ ] Add orphan-object reconciliation for failures outside the compensated write path.
- [x] Revoke browser object URLs on removal, reset and page unmount.
- [ ] Replace illustrative queue data with API-backed records.
- [ ] Resolve dependency audit findings without forced breaking upgrades.

## Test status

- Build: passing (`npm run build`, 2026-09-03)
- Unit/API contract tests: 11 passing (`npm test`, 2026-09-03)
- Typecheck/lint: passing (`npm run typecheck`, `npm run lint`, 2026-09-03)
- PostgreSQL/filesystem integration, component, accessibility, visual and E2E: pending

## Deployment status

- Local preview: `http://localhost:3000/`
- Production: not deployed
- Intended hostname: `sell.26fe.uk`
- Capture API in manifest: disabled
- Overseer manifest/proposals: infrastructure proposals pending
- Container verification: local Docker/OrbStack daemon unavailable; CI remains unverified
- Gitea Actions: enabled, with no repository secrets and no recorded run after PR #1
- Branch protection: intentionally not required per project owner
