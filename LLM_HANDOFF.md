# LLM handoff

Last updated: 2026-09-03

## Project

Sell My Stuff is a self-hosted, mobile-first AI selling assistant. The core experience is photographs → autonomous identification/research → only necessary questions → a complete proposal → explicit approval → verified external action. Read `BRIEF.md` before changing scope.

## Current state

- Branch: `codex/foundations`; no PR yet.
- `origin` is the authoritative Gitea repo: `gitea@git.26fe.uk:stue/sell-my-stuff.git`.
- `github` is the GitHub mirror: `git@github.com:digitalgravy/sell-my-stuff.git`.
- Both remotes currently have `main` at `3e4cd5e`.
- A Vinext/React/Tailwind/shadcn scaffold is installed.
- `app/page.tsx` is a functional local multi-photo intake prototype (picker/camera hint, drop, paste, preview, remove, submit success) with representative action/research cards.
- `app/globals.css` contains the initial warm-ivory/evergreen/copper light and dark design tokens.
- `public/og.png` is the generated social card and is wired through trusted-origin metadata.
- `Dockerfile`, `overseer-app.yaml`, and `.gitea/workflows/deploy.yml` establish the intended delivery path, but the local Docker daemon was unavailable for an image build.
- Nothing is deployed; no database, object storage, worker or external AI call exists yet.

## Architecture direction

Use a modular monolith for the web/API first, plus a separate durable worker and later a separately secured Browser Operator. The server is authoritative. PostgreSQL is the preferred structured store and an S3-compatible object store is preferred for images, but deployment availability must be verified before marking ADR 0002 accepted. All external systems sit behind adapters. Consequential operations use prepare → exact approval → execute → verify → audit.

See `ARCHITECTURE.md`, `SECURITY.md` and `docs/adr/`.

## Overseer facts

- Local Overseer repo: `../overseer`; current `main` was `e9a6f5f` when inspected.
- Persistent `overseer-core` runs at `192.168.5.80`, MCP at `http://overseer.internal:3900/mcp`, bearer-token authenticated.
- Do not commit an MCP token or project-scoped MCP config.
- Overseer owns first deploy via three proposals: container, UniFi DNS, NPM proxy. Human approval is required.
- Gitea Actions builds/tests/pushes immutable images and can only propose deployment using `-ci` adapters.
- Production apps run on `docker.26fe.uk`; registry is `gitea.internal:3000`.
- Secrets are SOPS+age encrypted in a separate private repository for the deployed Overseer runtime. Application secrets should be referenced from `overseer-app.yaml`, never committed.
- Validate monitoring checks against real data before enabling notifications; Overseer previously had a notification flood from an unreviewed check.
- The desired public name is `sell.26fe.uk`; local routing and IP/port must be allocated through Overseer, not guessed into infrastructure.

## Exact next action

1. Build the Docker image on a host with a running daemon and verify `/api/healthz` from the container.
2. Verify the existing Gitea repo has the required registry Actions secrets, then push `codex/foundations` and open a PR.
3. Start the first server-owned vertical slice: item/photo schema + migration + durable upload API + `inspect_images` job contract.
4. Begin authenticated eBay UK inspection; pause for user login/MFA if required.

## Commands

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

## Environment assumptions

- Node `>=22.13.0`.
- Development is on macOS; the local preview uses port 3000.
- Production will be a container managed by Overseer/Portainer on the existing VLAN 5 network.
- No credentials or authenticated browser state are present in this repo.

## External integration state

- eBay API research: initial official-source pass complete in `docs/research/ebay-capabilities-2026-09-03.md`; authenticated UI investigation remains.
- Authenticated eBay session: unknown; expect login/MFA and human takeover.
- Browser Operator: architecture only, no implementation/profile.
- AI providers: none configured.
- Marketplace, carrier and packaging adapters: none implemented.

## Known traps

- The repository was already created on both remotes before this session; do not create a duplicate via `overseer new-project`.
- `overseer-core`'s network MCP is plain HTTP on the LAN today. Never embed its bearer token in source, logs or `.mcp.json`.
- Do not infer production storage or allocate addresses without live Overseer evidence.
- The current upload success is presentation-only; do not describe it as durable or cross-device.
- Do not run `npm audit fix --force`; audit findings require deliberate compatible upgrades.
- The local Docker daemon was unavailable on 2026-09-03, so the Dockerfile has not yet been built end-to-end.
