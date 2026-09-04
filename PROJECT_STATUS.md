# Project status

Last updated: 2026-09-04

## Current phase

Milestone 0 foundations are merged. Milestone 1 now has a server-owned capture
contract and a first identification worker slice, but production persistence
remains safely disabled until its infrastructure is provisioned.

- Branch: `main` is authoritative; all work happens on short-lived branches
  merged locally then pushed straight to `main` (see "Merge process" below)
- Current PR: none open; delivery PRs #2–#5 are merged
- Current production version: not deployed
- Last code-bearing `main`: `7a8b020` (HEIC/HEIF photo conversion)

## Merge process

This coding agent does not hold a Gitea API token, so it cannot open or
merge PRs through Gitea's PR UI/API. With the project owner's explicit
permission (`.claude/settings.local.json`, gitignored, allows
`git push origin main` / `git push github main`), it instead: verifies
`npm test`, `typecheck`, `lint` and `build` locally, merges the feature
branch into `main` with `git merge --no-ff` (a real merge commit, not a
squash), and pushes directly to both `origin` (Gitea, authoritative) and
`github` (mirror). The audit trail for this workflow is the git history
itself: every commit is attributed to the project owner's email, carries a
`Co-Authored-By: Claude Sonnet 5` trailer and a `Claude-Session:` URL back
to the exact session that made it, and merge commits stay as real merges
(not fast-forwards) so `git log --graph` shows each unit of work. No PR
review thread exists for changes merged this way — if a reviewable PR trail
matters for a given change, ask for one explicitly and provide a Gitea
token, or open the PR link the agent prints after pushing a feature branch.

## In progress

- [ ] Complete Milestone 0 deployment foundations
  - [x] Responsive application, design tokens and multi-photo capture UI
  - [x] Standard self-hosted Next.js Node runtime and standalone image
  - [x] Docker/Overseer manifest and Gitea workflow
  - [x] Gitea PRs #1–#5 delivered or closed after their contents reached `main`
  - [x] First Gitea Actions container build completed successfully
  - [ ] Configure registry Actions secrets (the first run failed only at image push)
  - [ ] Create and approve the first Overseer container, DNS and proxy proposals
- [ ] Milestone 1 vertical slice: photo → draft item
  - [x] Camera/file picker, multiple images, drag/drop and clipboard input
  - [x] PostgreSQL item/photo/job schema and generated migration
  - [x] Byte-verified HEIC/JPEG/PNG upload with size/count limits
  - [x] Durable object-store boundary and compensating cleanup
  - [x] Atomic item metadata plus idempotent `inspect_images` job creation
  - [x] Feature-gated API wired to truthful UI success/error states
  - [x] `inspect_images` worker with leased Postgres claims, crash recovery and backed-off retries
  - [x] First schema-validated vision adapter (Anthropic, `client.messages.parse` + Zod)
  - [x] First evidence/confidence record model (`item_facts` table)
  - [ ] Provision and integration-test PostgreSQL plus durable upload storage
  - [ ] Verify the worker end-to-end against a real Anthropic API key and a real photo
  - [x] HEIC/HEIF → JPEG conversion before vision inspection
  - [x] "Ask user only if necessary" UI for `identity.open_questions`

## Blocked

- [ ] First infrastructure deployment
  - Blocker: Overseer must propose and apply real PostgreSQL, storage, container,
    DNS and reverse-proxy changes; no reusable database/object service was found.
  - Next action: prepare the exact Overseer proposals and migration procedure.
- [ ] Real end-to-end verification of the `inspect_images` worker
  - Blocker: no `ANTHROPIC_API_KEY` and no reachable Postgres in this
    environment (local Docker/OrbStack daemon unavailable), so the worker is
    unit-tested against fakes only, not run against the real Anthropic API
    or a real database.

## Next up

- [ ] Provision isolated PostgreSQL and a backed-up upload volume through Overseer.
- [ ] Run the migration and real database/filesystem integration test.
- [ ] Enable `CAPTURE_API_ENABLED` only after both dependencies are healthy.
- [ ] Configure `ANTHROPIC_API_KEY` (via Overseer/SOPS secrets, not the repo)
      and run the worker against a real item to verify the vision adapter end to end.
- [ ] Decide the production identity boundary after checking trusted-device conventions.
- [ ] Add component, accessibility and mobile E2E coverage for capture.

## Recently completed

- [x] Replaced the illustrative "Needs your attention"/"Working for you" rows
      with real data: `GET /api/items/homepage` (feature-gated, trusted-origin
      checked, returns a truthful empty snapshot rather than an error while
      capture is disabled), a `HomepageRepository` port + `PostgresHomepageRepository`
      that reads active items and their `identity.*` facts, and a pure
      `buildHomepageSnapshot` function (unit-tested, no database needed) that
      derives a display title, buckets `NEEDS_INFORMATION` items into
      attention with their first open question (or a confidence fallback
      reason), and buckets `INBOX`/`IDENTIFYING`/`RESEARCHING` into working
      with a named stage. `app/page.tsx` now fetches on mount and after a
      successful capture, with truthful loading/empty/error(+retry) states
      per `DESIGN_GUIDE.md`'s data-honesty rule. The "Last activity" line is
      now derived from the same real data. The three outcome metrics (items
      cleared / realised / in progress) stay illustrative — they need a
      valuation/sales data model that doesn't exist yet.
- [x] Corrected the Today view implementation to match its mockup: fixed the
      document-level Inter application, removed the blue/violet capture-card
      treatment and replaced reassuring capture copy with terse functional text.
- [x] Added `DESIGN_GUIDE.md` as the durable UI contract for future agents and
      annotated the Today homepage at its key hierarchy and behaviour boundaries.
- [x] Reworked the homepage into a restrained, Apple-inspired "Today" view:
      compact daily outcomes, a single prominent capture action, clear
      attention items and autonomous-work status. Preserved multi-photo,
      drag/drop, clipboard, upload, error and success behaviour while replacing
      the previous marketing-style hero and oversized capture surface.
- [x] Merged foundations PR #1 at `40966a2`.
- [x] Merged persistence PR #2 at `1f21d8c`.
- [x] Replaced the Cloudflare-oriented prototype runtime with standard Next.js
      self-hosting so the app can use Postgres and durable local storage.
- [x] Added Drizzle schema and migration for items, photos and jobs.
- [x] Added upload validation based on file signatures, not user-supplied names.
- [x] Added unit and API contract coverage for storage, rollback and feature gates.
- [x] Recorded the first storage decision in accepted ADR 0002.
- [x] Completed official-source and authenticated eBay research reconnaissance.
- [x] Replaced the serif display font with Bricolage Grotesque (large headings
      only) and Inter (base/UI text), after user feedback that the serif and
      then the initial display-font-everywhere pass were hard to read small.
- [x] Replaced the green/cream palette with a darker indigo/violet scheme
      (light and dark variants) after user feedback wanting something sleeker
      and less "trying to sell itself".
- [x] Added `item_facts` table (confidence/origin/evidence/source/retrieval
      model from the brief) and generated migration `0001_clean_magma.sql`.
- [x] Added leased job claims and scheduled retries with migration
      `0002_wakeful_moondragon.sql`.
- [x] Added `ObjectStore.get`, the `VisionIdentificationProvider` port, the
      `AnthropicVisionProvider` adapter, `PostgresResearchJobRepository`
      (leased `FOR UPDATE SKIP LOCKED` claims) and `runInspectImagesJob`, plus
      a bundled production poll-loop worker entrypoint (`npm run worker`).
- [x] Added the `PhotoConverter` port (`server/ai/photo-conversion.ts`) and
      `HeicPhotoConverter` (`server/ai/heic-photo-converter.ts`, using
      `heic-convert`'s pure-JS/WASM libheif build) so HEIC/HEIF photos are
      converted to JPEG before reaching the vision provider; wired into
      `runInspectImagesJob` and the production worker entrypoint. Verified
      against a real `.heic` file locally (gated test, see `DEVELOPMENT.md`).

## Known bugs

- [ ] Production capture returns a clear 503 until persistence infrastructure is ready.
- [ ] Navigation links and the three outcome metrics are illustrative and not API-backed.
- [ ] WebMCP registration is feature-detected but not contract-tested in a supported host.

## Technical debt

- [ ] Add orphan-object reconciliation for failures outside the compensated write path.
- [x] Revoke browser object URLs on removal, reset and page unmount.
- [x] Replace illustrative queue data with API-backed records.
- [ ] Resolve dependency audit findings without forced breaking upgrades.
- [ ] `item_facts` currently upserts one current value per `(itemId, field)`
      (latest evidence wins); the brief's full evidence model implies a
      historical ledger per field, not just the current value — add one when
      a stage needs to compare across research passes.
- [ ] An item stuck in `IDENTIFYING` after the worker exhausts
      `DEFAULT_MAX_ATTEMPTS` has no distinct terminal status or user-visible
      surface yet; it only shows up via the job's `FAILED` state/`lastError`.

## Test status

- Build: passing (`npm run build`, 2026-09-04)
- Unit/API contract tests: 34 passing, 1 skipped (`npm test`, 2026-09-04); the
  skipped test exercises real HEIC decoding and only runs when
  `HEIC_TEST_FIXTURE` points at a local `.heic` file (see `DEVELOPMENT.md`) —
  run manually and confirmed passing against a real HEIC photo on 2026-09-04
- Typecheck/lint: passing (`npm run typecheck`, `npm run lint`, 2026-09-04)
- PostgreSQL/filesystem integration, component, accessibility, visual and E2E: pending
- `inspect_images` worker and `AnthropicVisionProvider`: unit-tested against
  in-memory fakes only; no run against a real database or the real Anthropic API yet

## Deployment status

- Local preview: `http://localhost:3000/`
- Production: not deployed
- Intended hostname: `sell.26fe.uk`
- Capture API in manifest: disabled
- Overseer manifest/proposals: infrastructure proposals pending
- Container verification: CI built the image successfully; local Docker remains unavailable
- Gitea Actions: run #10 built the full web/worker image successfully, then failed at registry login because repository secrets are absent
- Branch protection: intentionally not required per project owner
