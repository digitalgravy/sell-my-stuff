# Project status

Last updated: 2026-09-07

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
- Last code-bearing `main`: `55f0cff` (item detail page)

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

Nothing currently blocked — the last blocked item (real end-to-end
`inspect_images` verification) was resolved 2026-09-04: a real iPhone photo
of an Apple HomePod mini was correctly identified end to end (manufacturer,
model, model number `A2374`, colour, all at 98% confidence, reading the
actual printed label) via `ANTHROPIC_API_KEY`/`DATABASE_URL` resolved
locally through Overseer's `get_app_secret` (see "Secrets access" below).

## Next up

- [x] Condition/damage/wear assessment — built 2026-09-07, following the
      design agreed with the project owner 2026-09-04: extends the existing
      automated-first, confidence-gated pattern (same as identity facts)
      rather than a new mechanism. A second, separate vision-model turn
      (own system prompt, own `condition_assessment_runs` Build-log table,
      run inside the same `inspect_images` job attempt as identification —
      the open design question was settled in favour of a distinct stage,
      per the brief's framing as its own concern) reports `overallGrade`
      (`new_sealed` through `spares_repair`) plus optional
      `functionalStatus`/`cosmeticWear`/`defects`/`missingParts`, each with
      its own confidence/evidence (`condition.*` item_facts). A low-
      confidence field or an open question routes the item to
      `NEEDS_INFORMATION` exactly like identity candidates do. Not yet
      built: the full `BRIEF.md` "Functional testing" checklist (category-
      specific interactive tests like keyboard power/keys/charging) —
      that's a distinct, larger feature (user-driven testing, a "Not
      tested" fallback), deliberately out of scope here.
- [ ] Provision a durable upload storage volume (via `container.volumes`,
      which the manifest schema already supports) and redeploy (a redeploy
      of an existing container, so no new DNS/proxy proposals this time).
- [ ] Only then set `CAPTURE_API_ENABLED=true` in `overseer-app.yaml` and
      redeploy.
- [ ] Decide the production identity boundary after checking trusted-device conventions.
- [x] Item detail page/route (`/items/[id]`). Homepage rows now link here
      instead of being inert `<button>`s. Shows photos (HEIC converted to
      JPEG on the fly for browser display, same converter the worker uses),
      every fact with its confidence/evidence/origin/timestamp, and the full
      `identification_runs` build log per attempt (outcome, model, real
      token counts, duration, and — in a `<details>` expander — the raw
      response JSON or error). A `FAILED` item gets a manual **Retry**
      button (`POST /api/items/[id]/retry`) that resets the job to `QUEUED`
      with a fresh attempt count and the item to `INBOX`; this is a manual
      override, not tied to any auto-retry policy, per the project owner's
      "this is a tool that works for me, not the other way round" — auto-
      retry (already exists, exponential backoff) is a convenience, manual
      override must always be available regardless of what auto-retry is
      doing. Verified live 2026-09-04 against the real HomePod mini item:
      photos, facts and the build log (20,005/190 real tokens) all correct.
      **Not built yet** (deliberately out of this pass — see below/next):
      an "answer the open question" action for `NEEDS_INFORMATION` items.
- [x] Item status must reflect what's *actually running*, not just the
      correct next lifecycle stage. Fixed 2026-09-04 for the one real
      instance: `RESEARCHING`'s stage label was "Researching recent sales,"
      which is a lie — no code processes that status at all (no second job
      type exists). Changed to "Identified — research not yet available"
      (`homepage-snapshot.ts`'s `WORKING_STAGE_LABEL`). `RESEARCHING` the
      *status* stays correct (it genuinely is the right next stage); only
      the copy describing current activity changed. General principle
      stated by the project owner, worth applying to any future status the
      same way: if a status's label implies work is happening and no code
      actually does that work, the label is wrong and must say so.
      Real research (eBay API call or Browser Operator search, per
      `BRIEF.md`) is still fully unbuilt — see `LLM_HANDOFF.md`'s "External
      integration state."
- [ ] Factor per-item AI cost into the eventual sale profitability/balance-
      sheet calculation, once a valuation/sales data model exists to attach
      it to. The raw data now exists (see "Recently completed" —
      `identification_runs` records `input_tokens`/`output_tokens`/`model`
      per attempt) but nothing aggregates or displays it yet — no
      cost-per-item rollup, no $-total, no UI surface.
      - **Real measured cost (2026-09-04, from the project owner's own
        Anthropic console billing, Sonnet 5, real iPhone photos)**: ~1 cent
        per photo — a 4-photo single-item identification call cost ~4 cents.
        Use this over the theoretical estimate below for topping-up/budget
        planning; it already accounts for whatever the theoretical model
        under- or overestimated (structured-output/schema overhead, actual
        output length across multiple candidates each carrying a full
        evidence string, etc.).
      - Theoretical cost model as of 2026-09-04, kept for context on *why*
        the real number lands where it does (per-MTok input/output pricing —
        treat as approximate and check console.anthropic.com/settings/billing
        for current live rates, since sources disagreed by ~50% on the
        Sonnet figure during this conversation): Sonnet 5 (current default
        via `ANTHROPIC_VISION_MODEL`) ≈ $2–3 input / $10 output; Haiku ≈ 4×
        cheaper than Sonnet but lower identification quality; Opus ≈ 2×
        Sonnet's price but higher quality. At Sonnet pricing, this model
        alone predicted only ~1–2.5 cents for a full 2–6 photo item (i.e.
        per-*item*, not per-*photo*) — the real per-photo rate above is
        higher, so budget off the measured number, not this one.
      - Since model choice is already just an env var, the eventual feature
        could go beyond flat cost tracking: selecting model by item's likely
        value/complexity (e.g. Haiku for a quick first pass, Sonnet/Opus
        only when needed) rather than always defaulting to one model.
- [ ] Add component, accessibility and mobile E2E coverage for capture.
- [ ] Milestone 2, Browser Operator: `sell-browser`, a separate Overseer
      project (`overseer-projects/sell-browser`, own repo/CI/manifest) —
      see ADR 0005/0008 for the design this implements. Started
      2026-09-05. **Deployed and live** at `sell-browser.26fe.uk`
      (port 3100 — 3000 collides with this app on the same Docker host)
      since 2026-09-06.
  - [x] Session-ownership state machine (`IDLE`/`AGENT_CONTROLLED`/
        `WAITING_FOR_HUMAN`/`HUMAN_CONTROLLED`/`RECONCILING_AFTER_HUMAN`/
        `ERROR`) and its HTTP API, fully tested.
  - [x] Dockerfile: Chromium + Xvfb + x11vnc + noVNC on Microsoft's
        Playwright image. Verified locally end-to-end (health check,
        session transitions, noVNC page all respond; `docker run image
        npm test` — what its CI actually runs — exits 0). Found and
        fixed a real bug in the process: `tzdata`'s interactive timezone
        prompt silently hung `apt-get install` with no output at all in
        a non-interactive build, misread at first as a slow image pull.
  - [x] First real deploy, 2026-09-06 — a genuine multi-day debugging
        arc (an `overseer-core` host migration mid-session broke DNS,
        then CI's proposal transport, then surfaced a port collision
        with this app, then the propose-only `-ci` adapter boundary);
        full detail in `sell-browser`'s own README "Deployment notes"
        and this file's `LLM_HANDOFF.md` counterpart. A genuinely useful
        byproduct: `mcp__overseer__run_doctor_ci_check`, a new Overseer
        capability that round-trip-verifies CI's deploy path end to end.
  - [x] Launch a real persistent-context Chromium and wire it to the
        session state machine (`src/browser.ts`), plus two deterministic
        actions (`GET /browser/page`, `POST /browser/navigate`) —
        verified against the live deployed container, not just locally.
  - [x] First-login bootstrap through the noVNC human-takeover view —
        **completed for real, 2026-09-06.** noVNC published at
        `sell-browser-vnc.26fe.uk` (`container.extraPorts`, LAN-only);
        the project owner logged into their real eBay account through
        it (clearing a real anti-bot `splashui/challenge` along the
        way), and `resume-agent` verified the actual resulting page
        (Seller Hub Product Research, Sold tab) before accepting
        control back — not just trusted the human's say-so. The
        persistent profile now holds a genuine authenticated eBay
        session. Getting noVNC reachable surfaced three more real
        gaps, all documented in `sell-browser`'s README "Deployment
        notes": `extraPorts`' DNS/proxy-host creation is gated behind
        the same `isFirstDeploy` check as plain redeploys (worked
        around manually); a fresh NPM proxy host doesn't allow
        WebSocket upgrades by default (broke the VNC connection until
        fixed); a container redeploy resets the in-memory session
        state to `IDLE` (expected, not a bug).
  - [x] `EbayBrowserResearchProvider` (the `ComparableSalesProvider` port
        from `BRIEF.md`; named for what it actually does since the pivot
        away from Product Research documented in `sell-browser`'s own
        README) — `server/research/ebay-browser-research-provider.ts`
        calls sell-browser's `POST /research/sold-listings` over HTTP,
        claiming its shared session (`/session/agent-claim`) only when
        idle and always releasing what it claimed. Any failure —
        unconfigured (`SELL_BROWSER_BASE_URL` unset), a busy/blocked
        session, a network error, an unexpected response shape — resolves
        to `{ outcome: 'unavailable', reason }`, never a thrown error, so
        a real problem here can only ever fall back to the existing
        manual-link path, not break the pipeline. Not yet verified live
        end-to-end: `sell-browser.26fe.uk` is LAN-only and unreachable
        from the dev machine this was built on (confirmed via a TLS SNI
        failure, not a code-level issue) — verified instead via the exact
        request/response contract read directly from `sell-browser`'s own
        route source, a full unit-test suite stubbing `fetch`
        (`test/ebay-browser-research-provider.test.ts`), and the
        job-level fallback behaviour
        (`test/research-comparable-sales-job.test.ts`). Worth a real
        live check once reachable from inside the LAN.
  - [x] `research_comparable_sales` job type here, reusing the existing
        `jobs`-table claim/lease pattern, feeding the already-built
        Evidence tab on the item detail page. Sales it finds go through
        the same match classifier as a manual capture import
        (`server/items/comparable-match.ts`) before being trusted as
        evidence, with the same pending/resolved Build-log cost tracking
        as every other AI call in this app. Falls back to the pre-existing
        "build a manual search link" behaviour whenever the browser
        provider is unavailable or finds nothing.

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

- [x] Added an activity-state pill (Working/Waiting/Paused/Errored) to
      homepage rows, generalizing the RESEARCHING label fix above into a
      real, reusable mechanism instead of a one-off string change.
      `deriveActivityState()` (`homepage-snapshot.ts`, pure and unit-tested)
      derives it from real `jobs.state` — RUNNING → Working, QUEUED →
      Waiting, FAILED status → Errored, and anything mid-pipeline with no
      active/queued job at all → Paused (the honest catch-all: today this
      only ever fires for RESEARCHING, but automatically catches any future
      stalled stage — a crashed job that left no trace, a not-yet-built
      capability — without needing a new special case each time).
      `NEEDS_INFORMATION` items deliberately get no pill — they're correctly
      blocked on the user, not "paused". `PostgresHomepageRepository` now
      loads each item's latest job state alongside its error. Verified live:
      the HomePod mini item correctly shows an amber "Paused" pill next to
      "Identified — research not yet available".
- [x] Added a per-attempt identification "build log" (`identification_runs`
      table, migration 0004): the full raw vision response (every candidate,
      not just the leading one, plus open questions), which model and
      provider were used, real input/output token counts from the API
      response, and — on failure — the error, all keyed to the exact job
      attempt. Previously only the single leading candidate's derived fields
      were kept (`item_facts`) and everything else Anthropic returned was
      discarded; a retried job also had no history beyond the latest error.
      `VisionIdentificationProvider` now exposes `provider`/`model` and
      `identify()` returns real token usage (`IdentificationOutcome`), not
      just the parsed result. No read path/UI for this yet — it's the raw
      log, not a viewer. Also directly starts answering "what did Anthropic
      actually return, are we storing it" and the per-item cost-tracking
      task above (`input_tokens`/`output_tokens` are now real, not
      estimated).
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
- Unit/API contract tests: 52 passing, 1 skipped (`npm test`, 2026-09-04); the
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
