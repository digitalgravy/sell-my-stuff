# Project status

Last updated: 2026-09-03

## Current phase

Milestone 0 — repository and engineering foundations, with the first recognisable Milestone 1 capture slice in progress.

- Branch: `codex/foundations`
- Current PR: none
- Current production version: not deployed
- Last known-good commit: `f61ac1b` (local test/typecheck/lint/build gate passed; container runtime remains unverified)

## In progress

- [ ] Establish the application foundation
  - [x] Read `BRIEF.md` and current Overseer operator documentation/source
  - [x] Scaffold responsive web application with the approved Sites toolchain
  - [x] Create intentional light/dark design tokens
  - [x] Build functional multi-photo intake preview
  - [x] Add initial capture-policy unit tests
  - [x] Add Docker/Overseer delivery configuration
  - [x] Add Gitea CI workflow
  - [ ] Verify Gitea runner secrets and production container build
  - [ ] Open PR and establish branch protection
- [ ] Milestone 1 vertical slice: photo → draft item
  - [x] Camera/file picker, multiple images, drag/drop and clipboard input
  - [x] Local image preview/removal and success state
  - [ ] Server-owned item record and image storage
  - [ ] Durable background job
  - [ ] Real vision provider adapter and schema validation
  - [ ] Research stage and evidence model

## Blocked

- [ ] First infrastructure deployment
  - Blocker: deployment would mutate real infrastructure and must be proposed, approved and executed through Overseer.
  - Next action: finish the container and manifest, then create the three first-deploy proposals.

## Next up

- [ ] Add the server-side item/photo schema and migrations.
- [ ] Decide the production identity boundary after checking existing trusted-device conventions.
- [ ] Implement durable image upload and a resumable `inspect_images` job.
- [ ] Research current eBay API and authenticated browser capabilities; write strategy ADRs.
  - [x] Initial official-source API/Product Research reconnaissance
  - [x] Authenticated Seller Hub, Product Research and Sold/Completed inspection
  - [ ] Sandbox/API publication proof
- [ ] Add component, accessibility and mobile E2E coverage for capture.

## Recently completed

- [x] Confirmed the existing Gitea authority (`origin`) and GitHub mirror (`github`) both point to this repository.
- [x] Confirmed Overseer is running persistently and provides Gitea CI, immutable image delivery, deployment proposals, DNS and NPM provisioning.
- [x] Started work on short-lived branch `codex/foundations`.
- [x] Opened the first meaningful local preview.
- [x] Added a branded social preview and site metadata.
- [x] Completed initial official-source eBay capability research.
- [x] Confirmed authenticated UK Product Research access and compared it with Sold/Completed search.
- [x] Pushed `codex/foundations` to the authoritative Gitea remote.

## Known bugs

- [ ] Uploaded photos exist only in browser memory and disappear on refresh; the UI clearly remains a prototype until server persistence lands.
- [ ] Navigation and sample task rows are illustrative and not yet wired to routes.
- [ ] WebMCP registration is feature-detected but not contract-tested in a supported host.

## Technical debt

- [ ] The initial Vinext UI scaffold is Cloudflare-oriented; production runtime fit must be confirmed before cementing the container boundary.
- [ ] Add object URL cleanup for page unmount as well as explicit removal/reset.
- [ ] Replace illustrative queue data with API-backed records.
- [ ] Resolve reported dependency audit findings without forced breaking upgrades.

## Test status

- Build: passing (`npm run build`, 2026-09-03)
- Unit tests: 3 passing (`npm test`, 2026-09-03)
- Typecheck/lint: passing (`npm run typecheck`, `npm run lint`, 2026-09-03)
- Component/integration/E2E/accessibility/visual: not yet established

## Deployment status

- Local preview: running on `http://localhost:3000/`
- Production: not deployed
- Intended hostname: `sell.26fe.uk` (with a LAN-direct `.internal` route to be selected by Overseer)
- Overseer manifest/proposals: pending
- Rollback: initial deployment not yet created
- Container verification: blocked locally because the Docker/OrbStack daemon is not running; CI will run the same Dockerfile gate.
- Gitea readiness: no branch protection rule and no repository Actions secrets currently exist; both must be configured before merging.
