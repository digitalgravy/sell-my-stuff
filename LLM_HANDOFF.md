# LLM handoff

Last updated: 2026-09-03

## Project

Sell My Stuff is a self-hosted, mobile-first AI selling assistant. The core
experience is photographs → autonomous identification/research → only necessary
questions → a complete proposal → explicit approval → verified external action.
Read `BRIEF.md` before changing scope.

## Current state

- Gitea PR #1 is merged. `main` is known-good at `40966a2`.
- Active branch: `codex/item-persistence`; PR not yet opened.
- `origin` is authoritative Gitea; `github` is the GitHub mirror.
- The app now uses standard Next.js 16 Node self-hosting with standalone output,
  not the initial Cloudflare/Vinext prototype runtime.
- The capture UI POSTs its actual files to `POST /api/items` and only shows a
  queued success state after a 201 response.
- `db/schema.ts` and `drizzle/0000_equal_swarm.sql` define the initial item,
  photo and durable-job records with revisions and idempotency.
- Uploads are signature-verified, bounded to 12 photos / 25 MB each / 150 MB
  total, written through an object-store adapter, and cleaned up if the database
  transaction fails.
- The first object-store implementation writes to `SELL_STORAGE_PATH`.
- Production capture remains intentionally disabled with
  `CAPTURE_API_ENABLED=false`; no database or upload volume exists yet.
- Nothing is deployed.

## Architecture direction

Use a modular monolith for web/API first, a durable worker using the same
database-backed job contract, and later a separately secured Browser Operator.
PostgreSQL is authoritative structured storage. Originals initially use a
dedicated durable filesystem volume behind an adapter; S3-compatible storage can
replace it when needed. Consequential operations always follow prepare → approve
exact proposal → execute → verify → audit.

See `ARCHITECTURE.md`, `SECURITY.md` and `docs/adr/`.

## Overseer facts

- Local Overseer repo: `../overseer`; inspected `main` was `e9a6f5f`.
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

1. Finish and merge the item-persistence PR after the full quality gate.
2. Use Overseer to prepare PostgreSQL, durable-volume and first-deploy proposals;
   do not guess addresses, ports or secret values.
3. Apply the Drizzle migration, configure `DATABASE_URL` and
   `SELL_STORAGE_PATH`, and perform a real capture/restart/restore test.
4. Only then set `CAPTURE_API_ENABLED=true` through a reviewed deploy proposal.
5. Implement idempotent `inspect_images` claiming/retry behavior and the first
   schema-validated vision adapter.

## Commands

```sh
npm install
npm run dev
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
- No credentials or authenticated browser state are present in this repo.

## External integration state

- eBay capability research and authenticated Seller Hub inspection are recorded
  in `docs/research/ebay-capabilities-2026-09-03.md`.
- Seller Hub reported that account details need updating before listing again.
- Browser Operator: architecture only, no implementation/profile.
- AI, marketplace, carrier and packaging adapters: not implemented.

## Known traps

- Do not create a duplicate repo via `overseer new-project`.
- Do not enable capture before both the migration and durable volume are proven.
- Do not put uploads on the container's ephemeral writable layer.
- Do not embed Overseer tokens, database URLs or browser state in source/logs.
- The local Docker daemon was unavailable on 2026-09-03.
- Gitea Actions has no repository secrets, so image push/proposal cannot succeed
  until credentials are configured through an approved mechanism.
- Branch protection is intentionally unnecessary per the project owner; PR review
  and passing local/CI evidence still remain the merge standard.
