# Project status

Last updated: 2026-09-04

## Current phase

Milestone 0 foundations are merged and **the app is now deployed and live**
at `https://sell.26fe.uk` (first deploy, 2026-09-04). Milestone 1 has a
server-owned capture contract and a first identification worker slice, but
persistence remains safely disabled in production (`CAPTURE_API_ENABLED=false`)
until a durable upload storage volume exists and an end-to-end capture run
has been verified.

- Branch: `main` is authoritative; all work happens on short-lived branches
  merged locally then pushed straight to `main` (see "Merge process" below)
- Current PR: none open; delivery PRs #2–#5 are merged
- Current production version: deployed and live at `https://sell.26fe.uk`
  (image `f945117d4e88dcb1261f2c33f1e2eb158d907efd`, capture disabled)
- Last code-bearing `main`: `f945117` (Postgres connection wiring)

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
  - [x] Configure registry Actions secrets (`REGISTRY_USERNAME=overseer-bot` +
        a properly-scoped token, added directly via the Gitea web UI —
        run #19 confirms the push step now succeeds)
  - [x] Create and approve the first Overseer container, DNS and proxy
        proposals — live at `https://sell.26fe.uk` since 2026-09-04. The
        NPM proxy host had to be corrected from the auto-generated
        `sell.internal` to `sell.26fe.uk` by hand — see "Known bugs"
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
  - [x] Provision PostgreSQL (`docker.26fe.uk:5432/sell_my_stuff`, outside
        Overseer's deploy-manifest flow) and apply all three migrations
        against it — `items`/`photos`/`jobs`/`item_facts` confirmed present
  - [ ] Provision a durable upload storage volume
  - [ ] Verify the worker end-to-end against a real Anthropic API key and a real photo
  - [x] HEIC/HEIF → JPEG conversion before vision inspection
  - [x] "Ask user only if necessary" UI for `identity.open_questions`

## Blocked

- [ ] Real end-to-end verification of the `inspect_images` worker
  - No longer blocked locally: `ANTHROPIC_API_KEY` and `DATABASE_URL` are
    both usable from this dev machine (via `.env.local`, fetched through
    Overseer's `get_app_secret`/SSH-signature auth — see "Secrets access"
    below). Only blocker now is doing an actual real-photo capture → worker
    run, which hasn't been exercised yet.

## Next up

- [ ] Finish the real-photo capture → worker → facts-written test locally
      (`CAPTURE_API_ENABLED=true`, `SELL_STORAGE_PATH` set, `npm run worker:dev`).
      Run 2026-09-04 confirmed the pipeline works end-to-end up through the
      real Anthropic call — upload, storage, job claim, photo read-back,
      real API call, error recording and retry all verified — but the
      account's Anthropic credit balance was too low, so a full success
      (facts actually written, item reaching `RESEARCHING`/`NEEDS_INFORMATION`)
      hasn't been observed yet. Re-run once credits are added.
- [ ] Provision a durable upload storage volume (via `container.volumes`,
      which the manifest schema already supports) and redeploy (a redeploy
      of an existing container, so no new DNS/proxy proposals this time).
- [ ] Only then set `CAPTURE_API_ENABLED=true` in `overseer-app.yaml` and
      redeploy.
- [ ] Decide the production identity boundary after checking trusted-device conventions.
- [ ] Track AI/operational cost per item (starting with the Anthropic vision
      call's actual token usage from the API response) and factor it into
      the eventual sale profitability/balance-sheet calculation, once a
      valuation/sales data model exists. Rough cost model as of 2026-09-04
      (Claude Sonnet 5, $2/$10 per MTok input/output): ~1–2.5 cents per item
      for a 2–6 photo identification call, regardless of the iPhone's
      capture resolution (Anthropic's vision API downscales any image to a
      ~1,600-token budget before processing). No cost tracking exists yet —
      `item_facts`/`jobs` don't record token usage or spend anywhere.
- [ ] Add component, accessibility and mobile E2E coverage for capture.

## Secrets access

The coding agent cannot read Overseer's `secrets/` directory or any raw
credential file directly — the harness's own safety classifier refuses
that regardless of in-chat permission, by design. Instead, Overseer now
serves `GET /docs/secrets-setup` (self-contained setup instructions) and a
scoped `GET /secrets/<project>/<environment>/<name>` endpoint returning
exactly one named value, authenticated via bearer token or an SSH
signature (this dev machine uses its own `~/.ssh/id_ed25519`, registered
with Overseer under an identity — production will need separate auth
keys, not yet set up). The Overseer MCP server (`mcp__overseer__*`,
registered globally) wraps this as `get_app_secret`/`list_app_secrets`.
Confirmed working 2026-09-04: fetched `ANTHROPIC_API_KEY` and
`DATABASE_PASSWORD` from `sell-my-stuff/dev` this way. This MCP client is
only permitted to read `sell-my-stuff/dev`, not `prod` (confirmed by a
refused `list_app_secrets` call) — `overseer-app.yaml`'s `environment`
field was changed from `prod` to `dev` to match where secrets actually
live; move both back together once this is genuinely production-ready.

## Recently completed

- [x] Connected the app to a real, reachable PostgreSQL instance
      (`docker.26fe.uk:5432/sell_my_stuff`, provisioned outside this repo)
      and ran all three migrations against it — confirmed `items`, `photos`,
      `jobs` and `item_facts` all exist. `server/db/client.ts` now also
      accepts `DATABASE_HOST`/`PORT`/`NAME`/`USER`/`DATABASE_PASSWORD` as an
      alternative to `DATABASE_URL` (unit-tested), since Overseer's
      `${secret:<name>}` manifest placeholders only substitute a whole env
      value, not one embedded in a larger string — a deployed container
      gets the password as its own var, not a pre-built connection string.
      `drizzle.config.ts` now has `dbCredentials`, and `db:generate`/
      `db:migrate` load `.env.local` the same way `worker:dev` does.
      `overseer-app.yaml` updated with these vars (`DATABASE_PASSWORD` as
      `${secret:DATABASE_PASSWORD}`) and `environment` changed `prod` → `dev`
      to match where the secret is actually stored (see "Secrets access").
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
- [ ] **Overseer bug (not this repo's code)**: a first deploy's `proposeDeploy()`
      hardcodes `${manifest.network.hostname}.internal` for *both* the UniFi
      DNS record and the NPM proxy host. Per the operator's actual convention
      (`.26fe.uk` names go through NPM for HTTPS; `.internal`/`.26fe` names
      are direct-host-only, no proxy), the NPM proxy host should have used
      `sell.26fe.uk`, matching `APP_ORIGIN` in `overseer-app.yaml` (which was
      already correct). Had to be corrected by hand post-deploy on
      2026-09-04. Will hit every future first deploy of every project until
      fixed in Overseer's `deploy.ts` — worth raising with the Overseer
      building system rather than hand-fixing again next time.

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
- Unit/API contract tests: 38 passing, 1 skipped (`npm test`, 2026-09-04); the
  skipped test exercises real HEIC decoding and only runs when
  `HEIC_TEST_FIXTURE` points at a local `.heic` file (see `DEVELOPMENT.md`) —
  run manually and confirmed passing against a real HEIC photo on 2026-09-04
- Typecheck/lint: passing (`npm run typecheck`, `npm run lint`, 2026-09-04)
- Migrations run and verified against the real `sell-my-stuff` Postgres
  instance (`npm run db:migrate`, 2026-09-04) — schema confirmed correct
- Filesystem integration, component, accessibility, visual and E2E: pending
- `inspect_images` worker and `AnthropicVisionProvider`: unit-tested against
  in-memory fakes only; a real capture → worker run hasn't been exercised yet
  (both credentials now resolve locally, so this is no longer infra-blocked)

## Deployment status

- Local preview: `http://localhost:3000/`
- **Production: live at `https://sell.26fe.uk`** since 2026-09-04, image
  `f945117d4e88dcb1261f2c33f1e2eb158d907efd`, `CAPTURE_API_ENABLED=false`.
  `/api/healthz` and `/` confirmed responding 200; `/api/items/homepage`
  confirmed returning the truthful empty snapshot.
- PostgreSQL: deployed and reachable at `docker.26fe.uk:5432/sell_my_stuff`, migrated
- Durable upload storage volume: not yet provisioned
- Overseer manifest/proposals: first deploy's 3 proposals (container, DNS,
  NPM proxy) approved and executed 2026-09-04. The NPM proxy host had to be
  hand-corrected from the auto-generated `sell.internal` to `sell.26fe.uk`
  — see "Known bugs". A future redeploy only touches the container proposal
  (DNS/proxy aren't re-proposed once the container exists), so this doesn't
  need re-fixing on every redeploy — only ever again on another project's
  first deploy, until Overseer's own bug is fixed.
- Container verification: CI built the image successfully; local Docker remains unavailable
- Gitea Actions: run #19 (2026-09-04) built/tested/linted/pushed/proposed
  successfully — `REGISTRY_USERNAME=overseer-bot` + a properly `write:repository`-
  and `write:package`-scoped token, set directly via the Gitea web UI, fixed
  the earlier registry-login 403s
- Branch protection: intentionally not required per project owner
