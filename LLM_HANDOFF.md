# LLM handoff

Last updated: 2026-09-04

## Project

Sell My Stuff is a self-hosted, mobile-first AI selling assistant. The core
experience is photographs → autonomous identification/research → only necessary
questions → a complete proposal → explicit approval → verified external action.
Read `BRIEF.md` before changing scope. Read `DESIGN_GUIDE.md` before changing
any user-facing interface. Its adult, single-user voice rules are
non-negotiable: avoid reassurance, encouragement, conversational filler and
assistant-persona copy.

## Current state

- The latest code-bearing `main` is `55f0cff` (item detail page,
  merged directly — see "Merge process without a Gitea token" below). PR #1
  was closed after its contents had already reached `main`; PRs #2–#5 are
  merged; #6 was a handoff-docs-only merge.
- **The app is deployed and live** at `https://sell.26fe.uk` (first deploy,
  2026-09-04, `CAPTURE_API_ENABLED=false`) — see "First deploy" below.
- Worker delivery was PR #3; deterministic container installation was PR #4.
- `main` contains the reviewed UI redesign and worker/vision slice described below.
- `origin` is authoritative Gitea; `github` is the GitHub mirror.

## Merge process without a Gitea token

This agent has no Gitea API token/`tea` CLI, so it cannot open or merge
Gitea PRs directly (unlike the `overseer-bot`-authored merges for PRs
#2–#6, which used that bot's own Gitea credentials outside Overseer's tool
surface — Overseer's own Gitea integration, `gitea-client.ts` in the
Overseer repo, only supports `createOrgRepo`/`setActionsSecret`, nothing
PR-related, so connecting Overseer's MCP would not add this capability
either). With explicit project-owner permission, the project owner added a
narrow, exact-match (no wildcard) allow rule to `.claude/settings.local.json`
(gitignored) for `git push origin main` and `git push github main` only.
The workflow is: verify `npm test`/`typecheck`/`lint`/`build` locally on a
short-lived branch, `git merge --no-ff` it into `main` (a real merge commit,
not a squash or fast-forward), then push directly to both remotes. The
audit trail is the git history itself — every commit carries the project
owner's authorship, a `Co-Authored-By: Claude Sonnet 5` trailer and a
`Claude-Session:` URL, and merge commits are preserved so `git log --graph`
shows each unit of work. No Gitea PR/review thread exists for changes
merged this way. If a reviewable PR trail is wanted for a specific change,
ask the project owner rather than assuming — either they open the PR link
printed after a feature-branch push, or they provide a scoped Gitea token.
- The app now uses standard Next.js 16 Node self-hosting with standalone output,
  not the initial Cloudflare/Vinext prototype runtime.
- The capture UI POSTs its actual files to `POST /api/items` and only shows a
  queued success state after a 201 response.
- `db/schema.ts` and `drizzle/0000_equal_swarm.sql` define the initial item,
  photo and durable-job records with revisions and idempotency.
  `drizzle/0001_clean_magma.sql` adds `item_facts` (confidence/origin/
  evidence/source/retrieval-timestamp records per the brief's provenance
  model — see "Worker and vision slice" below). `drizzle/0002_wakeful_moondragon.sql`
  adds the job availability and lease timestamps used for safe retries.
- Uploads are signature-verified, bounded to 12 photos / 25 MB each / 150 MB
  total, written through an object-store adapter, and cleaned up if the database
  transaction fails.
- The first object-store implementation writes to `SELL_STORAGE_PATH`; it now
  also supports reading a stored object back (`ObjectStore.get`), which the
  worker needs.
- Production capture remains intentionally disabled with
  `CAPTURE_API_ENABLED=false`; no database or upload volume exists yet.
- Nothing is deployed.

## UI redesign

Done in response to direct user feedback, in this order:
1. Swapped the serif `Newsreader` display font for `Bricolage Grotesque`.
2. User said small text still looked bad — split into two fonts: Bricolage
   Grotesque only on the ~4 largest headings (`font-display`), and `Inter` as
   the base font for everything else (was Geist Sans; Geist Sans import was
   removed entirely). Also bumped several caption/label sizes that were
   sitting at 10–11px up to 12–15px.
3. User asked for a sleeker, darker, blue/purple palette instead of the
   warm green/cream one, "doesn't need to sell itself". Rewrote every color
   token in `app/globals.css` (`:root`, `.dark`, and the
   `prefers-color-scheme: dark` block) to an indigo/violet OKLCH palette,
   including drop-shadow tints and the queue-icon gradient hexes in
   `app/page.tsx`, and updated the `themeColor` meta in `app/layout.tsx`.
4. User reported the queue-row byline text ("Checking the exact model and
   recent sales" etc.) was still too small/faint on a real screenshot at
   native scale — bumped that line from `text-xs` to `text-sm` + `font-medium`,
   and brightened `--muted-foreground` in dark mode (`oklch(0.68 ...)` →
   `oklch(0.735 ...)`) for better contrast against the near-black background.
5. On 2026-09-04 the user selected the proposed "Today View" direction because
   it felt clear and adult rather than over-explanatory. `app/page.tsx` now uses
   that structure: date/title and outcome summary, compact gradient capture
   focus, equal-weight "Needs your attention" and "Working for you" panels,
   then a subdued activity line. The complete photo intake state machine and
   WebMCP registration remain intact. `app/globals.css` now uses a neutral
   Apple-like black/white/blue system, and Inter is the sole UI/display face.
   The Bricolage Grotesque import was removed.
6. The first implementation did not match the mockup closely enough: the Inter
   CSS variable was attached below the element consuming it, so the browser
   visibly fell back to serif, and the capture card retained a blue/violet
   gradient. This was corrected by applying the font variables to `<html>` and
   the concrete Inter class to `<body>`, making the capture surface neutral,
   removing violet from the palette, and replacing "Ready when you are / Got
   something else to sell?" with the direct label "Add an item". Keep future
   personal-tool copy terse and functional.

Verified visually via the `claude-in-chrome` skill after each pass, plus
`typecheck`/`lint`/`test`/`build` every time. Not yet re-confirmed with the
user as fully resolved — check whether they gave further feedback before
assuming this is final.

## Worker and vision slice

Implements the "Now up" items "Implement the worker and real vision-provider
adapter" and a first version of the evidence/confidence model:

- `server/ai/vision-provider.ts` — `VisionIdentificationProvider` port,
  `identificationResultSchema` (Zod), `UnsupportedPhotoFormatError`.
- `server/ai/anthropic-vision-provider.ts` — the only concrete adapter so
  far. Uses `@anthropic-ai/sdk`'s `client.messages.parse` with
  `output_config.format: zodOutputFormat(identificationResultSchema)` so a
  malformed model response fails validation instead of becoming trusted
  data. The default model is `claude-sonnet-5`, overridable with
  `ANTHROPIC_VISION_MODEL`. Lazily reads `ANTHROPIC_API_KEY` via
  `getAnthropicVisionProvider()` — throws a clear error if unset, mirroring
  `getDatabase()`'s pattern for `DATABASE_URL`.
- `db/schema.ts` — new `item_facts` table + `fact_origin` enum. One current
  row per `(itemId, field)` (upsert on conflict) — **not** a full historical
  ledger; see PROJECT_STATUS.md technical debt.
- `server/items/research-repository.ts` / `postgres-research-repository.ts`
  — `ResearchJobRepository` port + Postgres implementation. Job claiming
  uses `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)`
  so multiple worker processes can run safely against the same queue. Claims
  have a 15-minute lease, crashed claims are reclaimed, and retries use bounded
  exponential backoff rather than hammering the provider.
- `server/jobs/inspect-images-job.ts` — `runInspectImagesJob()`: claims one
  `inspect_images` job, reads photos back through `ObjectStore.get`,
  base64-encodes them, calls the vision port, writes the leading candidate's
  fields as `item_facts` rows, marks photos `READY`, and transitions the
  item to `RESEARCHING` (confidence ≥ 0.7 and no open questions) or
  `NEEDS_INFORMATION` (otherwise). On failure, retries up to
  `DEFAULT_MAX_ATTEMPTS` (5) by requeuing, then marks the job permanently
  `FAILED` with `lastError` set. The item has no distinct terminal/error
  status yet if that happens — see technical debt.
- `server/jobs/run-inspect-images-worker.ts` — poll-loop source entrypoint.
  `npm run build` bundles it into `dist/worker.cjs`; `npm run worker` executes
  the production bundle, matching the brief's conceptual `sell-worker` process
  without a separate deployment yet.
- Tests: `test/inspect-images-job.test.ts` (in-memory fakes for the
  repository/object store/vision provider — claim/succeed, low-confidence
  routing, no-job-available, retry-then-give-up) and
  `test/vision-provider.test.ts` (schema acceptance/rejection).
- **Not verified against real infrastructure**: no `ANTHROPIC_API_KEY` and
  no reachable Postgres in this environment (Docker/OrbStack daemon down),
  so this is unit-tested against fakes only.
- **Resolved (2026-09-04)**: Claude vision only accepts JPEG/PNG/GIF/WebP,
  but HEIC/HEIF (the default iPhone format) is already accepted at capture
  time. `server/ai/photo-conversion.ts` (`PhotoConverter` port) and
  `server/ai/heic-photo-converter.ts` (`HeicPhotoConverter`, using
  `heic-convert`'s pure-JS/WASM libheif build — chosen over `sharp` because
  sharp's prebuilt binaries omit HEIC input support for patent-licensing
  reasons) now convert HEIC/HEIF to JPEG inside `runInspectImagesJob` before
  the vision call. `AnthropicVisionProvider`'s `UnsupportedPhotoFormatError`
  remains as a defense-in-depth backstop. Verified against a real `.heic`
  file locally; `test/photo-conversion.test.ts`'s real-decode test is gated
  on `HEIC_TEST_FIXTURE` so it stays skipped (not failing) without one. See
  ADR 0007's Implementation note.
- ADR 0007 updated with an "Implementation" section describing all of the above.

## Homepage attention/working slice

Replaces the illustrative "Needs your attention"/"Working for you" rows in
`app/page.tsx` with real data, per `DESIGN_GUIDE.md`'s data-honesty rule and
the "Next up" item it named:

- `server/items/homepage-repository.ts` — `HomepageRepository` port,
  `HomepageItemRow`/`HomepageItemFacts` types.
- `server/items/homepage-snapshot.ts` — `buildHomepageSnapshot()`, a pure
  function (fully unit-testable without a database) that buckets active
  items by status: `NEEDS_INFORMATION` → attention (title + the first
  `identity.open_questions` entry as the reason, or a fixed confidence
  fallback when there isn't one), everything else reachable
  (`INBOX`/`IDENTIFYING`/`RESEARCHING`) → working (title + a named stage
  label). Derives the display title from `identity.manufacturer`/`model`/
  `item_type` facts, since `items.title` is never set by the worker.
- `server/items/postgres-homepage-repository.ts` — `PostgresHomepageRepository`,
  queries `items` (status in the four reachable values) joined against a
  narrow set of `item_facts` fields, JSON-parsing each value defensively
  (`undefined`/`[]` on a parse failure rather than throwing).
- `app/api/items/homepage/route.ts` — `GET`, trusted-origin checked like
  `POST /api/items`. Returns `{ attention: [], working: [] }` (200, not an
  error) while `CAPTURE_API_ENABLED` is off, since zero items can truthfully
  exist yet; returns 500 with a factual error message on an unexpected
  database failure once capture is enabled.
- `app/page.tsx` fetches this on mount and again after a successful capture
  submission, rendering loading/empty/error(+retry) states — no bar/percentage
  progress, since the worker has no meaningful intermediate progress signal
  (`DESIGN_GUIDE.md`'s "Progress" rule). The "Last activity" line is now
  derived from the same fetched data (most-recently-updated item) rather than
  hardcoded. The three outcome metrics stay illustrative — no valuation/sales
  data model exists yet to back them truthfully.
- **Lint gotcha worth knowing**: the `react/react-compiler` oxlint rule
  (`error` in `.oxlintrc.json`) flags `useEffect(() => { void someCallback();
  }, [someCallback])` when `someCallback` is a `useCallback`-wrapped async
  function that calls `setState` — even when every `setState` call is after
  an `await`. It seems unable to trace `setState` safety through that
  indirection. The fix that satisfies it: inline the `.then()/.catch()` chain
  literally in the effect body (a plain async helper function, not a hook, is
  fine to call from there) rather than invoking a separately defined
  `useCallback`. See the two `requestHomepageSnapshot()` call sites in
  `app/page.tsx` for the working pattern.
- Tests: `test/homepage-snapshot.test.ts` (bucketing, reason fallback, stage
  labels including an unmapped-status fallback, title derivation) and
  `test/api-items-homepage-route.test.ts` (disabled-gate returns 200 + empty,
  not 503; cross-origin rejected). Not verified against a real database
  (same infrastructure gap as the rest of Milestone 1).

## Architecture direction

Use a modular monolith for web/API first, a durable worker using the same
database-backed job contract, and later a separately secured Browser Operator.
PostgreSQL is authoritative structured storage. Originals initially use a
dedicated durable filesystem volume behind an adapter; S3-compatible storage can
replace it when needed. Consequential operations always follow prepare → approve
exact proposal → execute → verify → audit.

See `ARCHITECTURE.md`, `SECURITY.md` and `docs/adr/`.

## Overseer facts

- Local Overseer repo: `../overseer`. As of 2026-09-04 it has a real,
  reachable PostgreSQL instance provisioned for this project
  (`docker.26fe.uk:5432/sell_my_stuff`) — provisioned directly (not through
  the `overseer-app.yaml`/`propose_deploy` manifest flow), and its manifest
  schema already grew `network.httpService` (default `true`) since the
  gap this doc used to describe, so a non-HTTP backing service can now skip
  the DNS/NPM proposals a first deploy otherwise always creates.
- **Overseer's MCP is now connected globally** (`mcp__overseer__*` tools,
  registered on this machine, not per-project) — `check_connection`,
  `discover`, `propose_deploy`, `get_app_secret`/`list_app_secrets`, etc.
  are directly callable; no `claude mcp add` step needed at session start
  any more. Confirm with `mcp__overseer__list_proposals` or similar if a
  fresh session doesn't see the tools.
- **Secret access now goes through a purpose-built endpoint, not files.**
  Overseer serves `GET http://overseer.internal:3900/docs/secrets-setup`
  (self-contained instructions) and `GET /secrets/<project>/<environment>/<name>`
  (bearer token or SSH-signature auth), wrapped by the MCP tools
  `get_app_secret`/`list_app_secrets`. This dev machine authenticates via
  its own `~/.ssh/id_ed25519`, already registered with an identity by the
  project owner. **Do not try to read `../overseer/secrets/*` directly** —
  the harness's own safety classifier refuses that regardless of in-chat
  permission (confirmed twice in the 2026-09-04 session), and this endpoint
  is the sanctioned replacement. This client (`claude-code-dev`) is only
  permitted to read `sell-my-stuff/dev`, not `prod` — confirmed by a refused
  `list_app_secrets` call for `prod`. `overseer-app.yaml`'s `environment`
  was changed from `prod` to `dev` to match (see PROJECT_STATUS.md).
- `${secret:<name>}` in a manifest's `container.env` only substitutes a
  *whole* env value (`^\$\{secret:name\}$`, anchored) — never embedded
  inside a larger string like a connection URL. This is why
  `server/db/client.ts` now accepts discrete `DATABASE_HOST`/`PORT`/`NAME`/
  `USER`/`DATABASE_PASSWORD` vars as an alternative to `DATABASE_URL`.
- Gitea Actions builds/tests/pushes immutable images and can propose deployment
  with `-ci` adapters; Overseer owns infrastructure mutation.
- First app deployment needs separate container, UniFi DNS and NPM proposals
  (unless `network.httpService: false`, not applicable to `sell-my-stuff`
  itself, which is an HTTP app).
- Production apps run on `docker.26fe.uk`; registry is `gitea.internal:3000`.
- Secrets live SOPS+age encrypted outside this repository.

## First deploy (2026-09-04)

`sell-my-stuff` is live at `https://sell.26fe.uk` — confirmed `/api/healthz`
200, `/` 200, `/api/items/homepage` returning the truthful empty snapshot
(capture still disabled). How it got there, since the path had several real
snags worth knowing about before touching deploy again:

- Gitea Actions was failing at the image-push step on every run (build/test/
  lint always passed). Root cause: `REGISTRY_USERNAME`/`REGISTRY_PASSWORD`
  repo secrets didn't exist. First attempt used `../overseer/secrets/gitea_full.token`
  via a `!`-prefixed curl script — it authenticated as `stue` (not
  `overseer-bot`, despite that being the token's assumed owner) and got
  `403 "user should be the owner of the repo"` — a misleading Gitea message
  that actually means **missing token scope** (`write:repository`), not an
  ownership problem, even for the actual repo owner. Fixed by the project
  owner regenerating a token with the right scopes and adding
  `REGISTRY_USERNAME=overseer-bot`/`REGISTRY_PASSWORD=<token>` directly via
  the Gitea web UI (Settings → Actions → Secrets) — confirmed by run #19.
- Once an image existed, CI's own "Propose deploy through Overseer" step
  still reported `failure` (took ~12.5 minutes) — but `list_proposals`
  showed all 3 proposals (container/DNS/NPM) were actually created
  successfully. **Don't trust that step's pass/fail alone — check
  `list_proposals` for the real outcome** if it ever happens again; the
  failure is likely in some post-proposal step or the `docker run --pull
  always` fetch of Overseer's own CLI image, not the proposals themselves.
- Approving/executing the 3 proposals was explicitly asked for by the
  project owner in chat, but `mcp__overseer__approve_operation` was refused
  by this harness's own safety classifier regardless — unlike `git push`,
  no permission-rule workaround was set up for this one (real infra
  mutation, deliberately left to the human/Overseer's own approval flow).
  The project owner approved+executed via Overseer directly.
- **Bug in Overseer itself, not this repo**: a first deploy's `proposeDeploy()`
  hardcodes `${manifest.network.hostname}.internal` for *both* the DNS
  record and the NPM proxy host. Per the operator's convention (`.26fe.uk`
  goes through NPM for HTTPS, `.internal`/`.26fe` are direct-host-only), the
  NPM proxy host should have used `sell.26fe.uk` — matching `APP_ORIGIN` in
  `overseer-app.yaml`, which was already correct. Had to be hand-corrected
  post-deploy. Will recur on every other project's first deploy until fixed
  in Overseer's `deploy.ts` (see PROJECT_STATUS.md's "Known bugs").

## Real-photo verification, item status accuracy, item detail page (2026-09-04)

All done in one session, in this order — see PROJECT_STATUS.md's "Recently
completed" for full detail on each:

- Ran a real capture → worker → facts-written test end to end (Apple
  HomePod mini, 98% confidence, real label text read correctly). Confirmed
  the whole pipeline works against real infrastructure.
- Found and fixed a real honesty bug the project owner caught directly:
  `RESEARCHING` items showed "Researching recent sales" when literally
  nothing processes that status (no second job type exists). Generalized
  the fix into `deriveActivityState()` (`homepage-snapshot.ts`) — a
  Working/Waiting/Paused/Errored pill derived from real `jobs.state`, not
  asserted from lifecycle status. "Paused" is the honest catch-all for
  "mid-pipeline, nothing queued or running" and needs no update for any
  future stage that stalls the same way.
- Added `identification_runs` (migration 0004): a per-attempt "build log"
  with the full raw vision response (every candidate, not just the
  leading one), provider/model, real token usage, and errors — previously
  discarded entirely.
- Built the item detail page (`/items/[id]`), replacing inert homepage
  buttons: photos (HEIC converted to JPEG on the fly — new
  `GET /api/items/[id]/photos/[photoId]` route, reusing the worker's own
  `HeicPhotoConverter`), every fact, and the build log per attempt. A
  `FAILED` item gets a manual **Retry** button
  (`POST /api/items/[id]/retry`) — resets the job to `QUEUED`/attempt 0 and
  the item to `INBOX`. Explicit project-owner design principle: this is
  manual override, always available, never gated behind auto-retry
  succeeding or failing first ("a tool that works for me, not the other
  way round"). New port: `server/items/item-detail-repository.ts` +
  `postgres-item-detail-repository.ts`.
- **Not built**: an "answer the open question" action for
  `NEEDS_INFORMATION` items — the detail page shows facts but has no write
  action yet for user-supplied answers.

## Browser Operator (`sell-browser`), started 2026-09-05

A separate Overseer project, not a folder in this repo:
`gitea@git.26fe.uk:overseer-projects/sell-browser.git`
(`http://gitea.internal:3000/overseer-projects/sell-browser`). Deployed via
its own `overseer-app.yaml`/CI, on the same Jupiter/Docker infrastructure as
this app — confirmed with the project owner that "Jupiter" is the Proxmox
host, not the separate always-on macOS machine, which remains only a
possible future fallback. See ADR 0005/0008 for the design; that repo's own
`README.md` "Status" section is the authoritative list of what's real vs.
not yet built there — don't duplicate it here, it will drift.

**Deployed, live, and — as of 2026-09-06 — genuinely logged into eBay.**
Live at `sell-browser.26fe.uk` (port 3100 — 3000 collides with this app
on the same Docker host), with noVNC reachable at
`sell-browser-vnc.26fe.uk` (LAN-only, `container.extraPorts`). What
exists (commit `7a5fd9c` there): the session-ownership state machine and
its HTTP API; a real persistent-context Chromium (`src/browser.ts`);
`GET /browser/page`, `POST /browser/navigate`, `POST
/session/request-login` (navigates to Seller Hub Product Research +
pauses for a human) and `POST /session/resume-agent` (re-verifies the
real page via `src/ebay.ts`'s `looksLoggedIn()` before handing control
back — recognises both eBay's plain sign-in redirect and its
`splashui/challenge` anti-bot interstitial). **First-login bootstrap is
done for real**: the project owner logged into their actual eBay
account through noVNC, `resume-agent` verified the real resulting page
(Seller Hub Product Research, Sold tab) before accepting it, and the
persistent profile now holds a genuine authenticated session. Still not
built: anything that actually searches/extracts from Product Research —
`POST /research/product-search` still returns `501`. That's the real
next step, and the browser is now sitting exactly where it needs to be
to start on it.

Two unrelated real bugs found and fixed while building this, both worth
remembering for anything else in this project's orbit:

1. `tzdata` (pulled in by xvfb/x11vnc) prompts interactively for a
   timezone and silently hangs `apt-get install` with zero output in a
   non-interactive `docker build` — looked exactly like a slow
   base-image pull, wasn't. Fix: `ENV DEBIAN_FRONTEND=noninteractive` +
   a preset `TZ` before the `apt-get install` line.
2. A Dockerfile `ENTRYPOINT` that always launches the full app,
   ignoring any command Docker was actually invoked with, makes
   `docker run image npm test` (what CI's "run tests" step does) hang
   forever launching the real server instead of running tests. Fix:
   `if [ "$#" -gt 0 ]; then exec "$@"; fi` at the top of `entrypoint.sh`.

**Overseer-side saga, 2026-09-05/06 (not this repo's bug, but blocked
`sell-browser`'s first deploy for a long time and is worth knowing about
if a future deploy of anything acts the same way):** `overseer-core` was
migrated to a new host (`192.168.5.85`) mid-session. This surfaced three
independent, since-fixed issues, roughly in the order discovered:
- Stale local DNS cache for `overseer.internal` (a real UniFi record, TTL
  60s, that had genuinely already updated — this one was just local
  caching, not an Overseer bug).
- CI's "propose deploy" step ran its own disposable `overseer-core`
  container against local Docker volumes, structurally unable to ever
  write to the same store the live dashboard/MCP clients read from —
  fixed by changing CI to call the live `POST /deploy` HTTP endpoint
  directly instead (content-based, no server-filesystem path needed).
  `mcp__overseer__run_doctor_ci_check` now exists specifically to catch
  a regression of this class automatically.
- `portainer-ci`/`unifi-ci`/`nginx-proxy-manager-ci` are (correctly,
  intentionally) propose-only — no adapter has ever been able to
  execute a CI-originated proposal directly. Getting a real CI-proposed
  deploy to actually run requires re-proposing the same manifest via the
  `-mutable` adapters (a human, or a full-tier MCP client — not the
  same tier CI or a remote agent normally holds), approving + executing
  that, then rejecting the original `-ci` proposal as superseded. No
  automation for this handoff exists yet.
- A dangling never-started container from a failed first-deploy attempt
  silently makes every subsequent `propose_deploy` treat it as an
  existing container and skip DNS/proxy-host creation entirely, with no
  error. Check both explicitly after any redeploy that followed a
  failed first attempt.
- The same gap applies to `container.extraPorts`, not just first
  deploys generally: adding a new `extraPorts` entry to an
  already-existing container correctly updates its port bindings, but
  silently never proposes the DNS record/proxy host for it (confirmed
  with the Overseer maintainer, 2026-09-06) — worked around manually via
  `propose_unifi_add_static_dns_record` +
  `propose_nginx_proxy_manager_create_proxy_host`.
- A freshly-created NPM proxy host doesn't allow WebSocket upgrades by
  default, and the create-proxy-host tool has no parameter for it — broke
  noVNC specifically ("Failed to connect to server" despite the static
  page loading fine over plain HTTP) until
  `propose_nginx_proxy_manager_update_proxy_host_settings` was used
  afterward to set `allowWebsocketUpgrade: true`.

Full detail on all of the above is in `sell-browser`'s own README
("Deployment notes") — this is the summary, not the authority.

## Exact next action

1. Continue `sell-browser` — first-login bootstrap is done for real
   (genuine authenticated eBay session in the persistent profile,
   verified 2026-09-06). Build `EbayProductResearchBrowserProvider`:
   navigate Seller Hub Product Research (already reachable — the
   browser is currently sitting on it), search by keyword/model, and
   extract comparable-sale rows into the `ComparableRecord` shape from
   `BRIEF.md`, on top of the now-real `POST /browser/navigate` action.
   Then the `research_comparable_sales` job type on this repo's side
   (reuses the existing `jobs`-table claim/lease pattern, no new
   mechanism), and finally wiring that provider into the real
   `ItemDetailRepository`/`EvidenceInfo` so the item detail page's
   Evidence tab shows real comparables instead of its current honest
   "not built yet" state.
2. Build the "answer the open question" action for `NEEDS_INFORMATION`
   items on the item detail page (writes a `user_confirmed`/`user_evidence`
   fact, re-queues research) — the one deliberately-deferred piece of the
   detail page above.
3. Condition/damage/wear assessment — design already agreed with the
   project owner (extends the existing automated-first, confidence-gated
   pattern used for identity facts); see PROJECT_STATUS.md's "Next up" for
   the full spec pointer (`BRIEF.md`'s "Condition model"/"Functional
   testing" sections) and the open same-call-vs-separate-stage question.
4. Provision a durable upload storage volume (the manifest's
   `container.volumes` already supports this — hostPath/containerPath/
   readOnly — no new Overseer capability needed) and redeploy — this is a
   redeploy of an already-existing container, so only the container proposal
   is created, not new DNS/proxy proposals.
5. Only then set `CAPTURE_API_ENABLED=true` in `overseer-app.yaml` and redeploy.
6. Consider raising the `.internal`-vs-`.26fe.uk` NPM naming bug with the
   Overseer building system so it doesn't need manual correction again.

## Handoff checklist

1. Read `BRIEF.md`, then `OVERSEER-INFORMATION.md`, this file,
   `PROJECT_STATUS.md`, `ROADMAP.md`, `DESIGN_GUIDE.md`, and the relevant ADRs.
2. Fetch `origin/main`; do not treat an older local `main` as authoritative.
3. Preserve `CAPTURE_API_ENABLED=false` until Postgres, migrations and the
   durable upload volume have been provisioned and verified.
4. Use Overseer for infrastructure mutations; do not create infrastructure
   directly or misuse the single HTTP-application deploy manifest for Postgres.
5. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`
   before merging application changes.

## Commands

```sh
npm install
npm run dev
npm run worker:dev   # source-mode worker (needs DATABASE_URL, ANTHROPIC_API_KEY)
npm run worker       # production bundle created by npm run build
npm test
npm run typecheck
npm run lint
npm run build
npm run db:generate
npm run db:migrate
```

## Environment assumptions

- Node `>=22.13.0`.
- Development is macOS; the preview uses port 3000.
- Production is a container managed by Overseer/Portainer on VLAN 5.
- Durable capture additionally requires `DATABASE_URL`, `SELL_STORAGE_PATH` and
  `CAPTURE_API_ENABLED=true`.
- The worker additionally requires `ANTHROPIC_API_KEY` (and `DATABASE_URL`).
- No credentials or authenticated browser state are present in this repo.

## External integration state

- eBay capability research and authenticated Seller Hub inspection are recorded
  in `docs/research/ebay-capabilities-2026-09-03.md`.
- Seller Hub reported that account details need updating before listing again.
- Browser Operator: deployed and live (`sell-browser`, its own Overseer
  project — session-state machine, HTTP API, headed-Chromium Docker image,
  a real persistent-context Chromium and two working deterministic browser
  actions, all verified against the live container) but no authenticated
  eBay session, no first-login bootstrap, no research extraction yet —
  see "Browser Operator (`sell-browser`), started 2026-09-05" above.
- AI provider: first vision adapter implemented (Anthropic only, see above),
  unverified against the real API. Marketplace, carrier and packaging
  adapters: not implemented.

## Known traps

- Do not create a duplicate repo via `overseer new-project`.
- Do not enable capture before both the migration and durable volume are proven.
- Do not put uploads on the container's ephemeral writable layer.
- Do not embed Overseer tokens, database URLs or API keys/secrets in source/logs.
- The local Docker daemon was unavailable on 2026-09-03 and again 2026-09-04.
- Gitea Actions image push works as of run #19 (2026-09-04) — but its
  "Propose deploy through Overseer" step can still report `failure` even
  when the proposals were actually created correctly; check
  `mcp__overseer__list_proposals` for ground truth, don't trust that one
  step's conclusion alone.
- `mcp__overseer__approve_operation`/`execute_operation` are refused by this
  harness's classifier even with explicit in-chat permission from the
  project owner (confirmed 2026-09-04) — unlike `git push`, no permission
  rule was set up to allow these; real infrastructure approval stays with
  the human/Overseer directly. Don't ask for a workaround here.
- Branch protection is intentionally unnecessary per the project owner; PR review
  and passing local/CI evidence still remain the merge standard.
- The project owner has authorised the coding agent to open and merge future PRs
  at its judgement when satisfied with the review and verification evidence;
  no additional merge confirmation is required.
- `AnthropicVisionProvider` will throw immediately and clearly if
  `ANTHROPIC_API_KEY` is unset — this is intended (fail fast), not a bug to
  "fix" by adding a fallback/mock provider in production code.
- Do not try to read `../overseer/secrets/*` (or any raw credential file)
  directly via Bash — the harness's classifier refuses this regardless of
  in-chat permission (confirmed twice, 2026-09-04). Use Overseer's
  `get_app_secret`/`list_app_secrets` MCP tools instead.
- Never pass a fetched secret value as literal text in a Bash command
  (e.g. `DATABASE_PASSWORD='...' node -e ...`) — the classifier blocks this
  too. Write it to `.env.local` (gitignored) via the Edit/Write tool
  instead, then load it with `node --env-file-if-exists=.env.local`, same
  pattern as `worker:dev`/`db:migrate`/`db:generate`.
- A manifest's `${secret:name}` only substitutes a whole env value, never
  one embedded in a larger string — don't try to build e.g. a full
  `DATABASE_URL` with an inline secret placeholder in `overseer-app.yaml`.
