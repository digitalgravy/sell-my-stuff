# LLM handoff

Last updated: 2026-09-04

## Project

Sell My Stuff is a self-hosted, mobile-first AI selling assistant. The core
experience is photographs → autonomous identification/research → only necessary
questions → a complete proposal → explicit approval → verified external action.
Read `BRIEF.md` before changing scope.

## Current state

- The latest code-bearing `main` is `3dfcf9e` (PR #4). PR #5 (`aee095d`) is
  documentation-only. PR #1 was closed after its contents had already reached
  `main`; PRs #2–#5 are merged.
- Worker delivery was PR #3; deterministic container installation was PR #4.
- `main` contains the reviewed UI redesign and worker/vision slice described below.
- `origin` is authoritative Gitea; `github` is the GitHub mirror.
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
  `npm run build` bundles it into `dist/worker.mjs`; `npm run worker` executes
  the production bundle, matching the brief's conceptual `sell-worker` process
  without a separate deployment yet.
- Tests: `test/inspect-images-job.test.ts` (in-memory fakes for the
  repository/object store/vision provider — claim/succeed, low-confidence
  routing, no-job-available, retry-then-give-up) and
  `test/vision-provider.test.ts` (schema acceptance/rejection). 23 tests
  pass in total (`npm test`).
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

## Architecture direction

Use a modular monolith for web/API first, a durable worker using the same
database-backed job contract, and later a separately secured Browser Operator.
PostgreSQL is authoritative structured storage. Originals initially use a
dedicated durable filesystem volume behind an adapter; S3-compatible storage can
replace it when needed. Consequential operations always follow prepare → approve
exact proposal → execute → verify → audit.

See `ARCHITECTURE.md`, `SECURITY.md` and `docs/adr/`.

## Overseer facts

- Local Overseer repo: `../overseer`; its `CURRENT_STATE.md` (as of
  2026-08-26) shows M0–M5 complete plus M6 (Home Assistant) started, with
  real mutations proven against Proxmox/Portainer/UniFi. It has **no
  PostgreSQL/Redis/object-storage provisioning capability recorded** — only
  Proxmox, Portainer, UniFi and (in progress) Home Assistant adapters.
  Provisioning a database for this project is therefore new Overseer work,
  not a reuse of an existing operation.
- Persistent `overseer-core` MCP is at `http://overseer.internal:3900/mcp` and
  bearer-token authenticated. Never commit its token or project MCP config.
- Gitea Actions builds/tests/pushes immutable images and can propose deployment
  with `-ci` adapters; Overseer owns infrastructure mutation.
- First app deployment needs separate container, UniFi DNS and NPM proposals.
- Production apps run on `docker.26fe.uk`; registry is `gitea.internal:3000`.
- Secrets live SOPS+age encrypted outside this repository.
- Live inventory contained no PostgreSQL, Redis, MinIO or other object service
  suitable for reuse, so persistence requires new proposals.

## Exact next action

1. Prepare the missing PostgreSQL/durable-volume provisioning capability in
   Overseer; its current deploy manifest only models one application container
   and would incorrectly create an HTTP proxy for a database dependency.
2. Configure Gitea repository registry secrets so the already-successful image
   build can push and reach the proposal step.
3. Once infrastructure exists: apply all Drizzle migrations, configure
   `DATABASE_URL`, `SELL_STORAGE_PATH` and `ANTHROPIC_API_KEY`, and perform a
   real capture → worker → facts-written test end to end.
4. Only then set `CAPTURE_API_ENABLED=true` through a reviewed deploy proposal.
5. Build the "3 things need you" UI backed by `identity.open_questions`
   facts, replacing the current illustrative queue data in `app/page.tsx`.

## Handoff checklist

1. Read `BRIEF.md`, then `OVERSEER-INFORMATION.md`, this file,
   `PROJECT_STATUS.md`, `ROADMAP.md`, and the relevant ADRs.
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
- Browser Operator: architecture only, no implementation/profile.
- AI provider: first vision adapter implemented (Anthropic only, see above),
  unverified against the real API. Marketplace, carrier and packaging
  adapters: not implemented.

## Known traps

- Do not create a duplicate repo via `overseer new-project`.
- Do not enable capture before both the migration and durable volume are proven.
- Do not put uploads on the container's ephemeral writable layer.
- Do not embed Overseer tokens, database URLs or API keys/secrets in source/logs.
- The local Docker daemon was unavailable on 2026-09-03 and again 2026-09-04.
- Gitea Actions has no repository secrets, so image push/proposal cannot succeed
  until credentials are configured through an approved mechanism.
- Branch protection is intentionally unnecessary per the project owner; PR review
  and passing local/CI evidence still remain the merge standard.
- The project owner has authorised the coding agent to open and merge future PRs
  at its judgement when satisfied with the review and verification evidence;
  no additional merge confirmation is required.
- `AnthropicVisionProvider` will throw immediately and clearly if
  `ANTHROPIC_API_KEY` is unset — this is intended (fail fast), not a bug to
  "fix" by adding a fallback/mock provider in production code.
- Overseer's current application deploy flow cannot safely model the Postgres
  dependency: it provisions one container plus app DNS/HTTP proxy. Extend its
  proposal model rather than abusing that path or publishing Postgres blindly.
