# Project Overseer — Standalone Briefing

A self-contained handoff document — everything needed to understand
and continue working on Project Overseer without access to the repo.
If you *do* have repo access, `docs/operator-guide.md` and
`CURRENT_STATE.md` are the living, more detailed versions of this;
treat this doc as a snapshot as of **2026-09-03**.

## What Overseer is

Project Overseer is a secure, modular control plane for a homelab
(domain `26fe.uk`), built so an LLM (Claude Code, or a compatible
client) can observe, monitor, and — only with explicit approval —
change real infrastructure and applications. It is **read-only by
default**: every remote mutation goes through a proposal → approval →
execution → audit lifecycle, enforced in code, not just by convention.

Codebase: `git.26fe.uk/stue/overseer` (Gitea, self-hosted) and mirrored
to `github.com/digitalgravy/overseer`.

## The homelab it manages (key facts)

- **UniFi network** (`26fe.uk`), several VLANs. The one that matters
  most: VLAN 5 / `192.168.5.0/24` ("Virtual Machines") — hosts
  `jupiter` (Proxmox, `.10`), `docker.26fe.uk` (Portainer/Docker host,
  `.50`), `git.26fe.uk` (Gitea, `.22`), and Overseer's own persistent
  runtime at `.80`.
- **`jupiter`**: the one physical server. Supermicro X10SDV-4C-TLN2F
  (Mini-ITX), Xeon D-1521 SoC, ~64GB RAM, in a Jonsbo N5 case. Runs
  Proxmox VE, hosting the Docker/Gitea LXCs above. Storage: a Samsung
  970 EVO NVMe boot drive + 9× Seagate ST8000NM001A 8TB enterprise
  drives (ZFS pool) via a Dell-branded Broadcom/LSI SAS2008 HBA. Also
  has an out-of-band IPMI/BMC on VLAN 1 (`192.168.1.222`) — useful
  because it stays reachable even if the main network stack hangs.
- **Managed platforms**: UniFi (network), Proxmox (virtualization,
  read-only), Portainer (Docker container management), Nginx Proxy
  Manager (reverse proxy / TLS), Home Assistant (smart home). Each has
  its own least-privilege Overseer credential — never the operator's
  own.

## Architecture, in brief

- **Adapters** (`src/adapters/<platform>/`): a `client.ts` (raw API
  calls) + `adapter.ts` (normalizes into a common `ResourceEnvelope`
  shape, enforces capability gating). One per platform.
- **Capability gating** (`src/core/policy/capabilities.ts`): every
  adapter *instance* is configured with `read` / `propose` / `mutate`
  capabilities. A call the instance isn't granted for is refused before
  it reaches the platform — e.g. `unifi-ci` (used by CI) is capped at
  `[read, propose]` even though it reuses a credential that could do
  more, so a compromised CI job can never mutate anything for real.
- **The safety lifecycle** (`src/core/execution/lifecycle.ts` +
  `operations.ts`): every real mutation is **proposed** (full detail:
  target, reason, expected interruption, rollback plan), separately
  **approved** by a named human (or a policy-derived synthetic approval
  that itself traces back to a real human decision — see "Auto-approve
  redeploys" below), **executed** (re-checks for drift immediately
  before applying, aborts if state changed since proposal), and
  **audited** (append-only, hash-chained log —
  `data/audit/audit.log.jsonl` — tamper-evident, verifiable with
  `audit verify`).
- **One shared entry point**: `OverseerContext`
  (`src/core/context.ts`) — both the CLI and every MCP tool wrap this
  same class, so behavior (including what gets audited) can never
  drift between interfaces.

## How to actually talk to Overseer

### Option 1: CLI (any machine with the repo + credentials)

```sh
node --import tsx src/cli/index.ts <command>
# or: npm run cli -- <command>
```

### Option 2: MCP — local (stdio)

```sh
npm run mcp
```

Only reachable by a process on the same machine.

### Option 3: MCP — network (HTTP), the persistent instance

Overseer's own runtime (`overseer-core`) runs as a container on
`docker.26fe.uk`, on its own dedicated IP (`192.168.5.80`) on a
macvlan network, and exposes its MCP server over HTTP — this is what
lets multiple real clients (a dev machine, another LLM on a different
machine) share the *same* planning/audit store instead of each having
an isolated local copy.

- `http://overseer.internal:3900/mcp` (direct, LAN-only)
- `http://overseer.26fe.uk/mcp` (via Nginx Proxy Manager — plain HTTP,
  no TLS certificate attached yet)

To connect a Claude Code session:

```sh
claude mcp add --transport http --scope local overseer \
  http://overseer.internal:3900/mcp \
  --header "Authorization: Bearer <token>"
```

Use `--scope local`, never `project` (which would commit the token
into a shared, version-controlled `.mcp.json`). Verify with `claude
mcp list` — look for `✔ Connected`. **Gotcha**: an MCP server added
mid-session doesn't surface its tools until the client
reconnects/restarts — check this at the *start* of a session.

Auth is a bearer token per named client, two tiers:
- **`full`** — every tool, including `approve_operation` /
  `execute_operation`. This dev machine's own token.
- **`propose`** — read/discover/propose only; `approve_operation` /
  `execute_operation` are refused before the request reaches Overseer's
  core logic at all. Used for a second LLM client (OpenClaw) on another
  LAN machine, so it can observe and propose but never unilaterally
  make a real change.

Tokens live in `secrets/mcp_token_*.token` locally (gitignored), and —
for the deployed instance — SOPS-encrypted in a separate private repo,
decrypted at container startup (see "Credentials" below).

## Credentials — where they actually live

Two independent layers, don't confuse them:
1. **Adapter capability** (`read`/`propose`/`mutate`) — per configured
   adapter instance, e.g. `unifi` (read-only) vs `unifi-mutable`
   (separately provisioned, broader credential) vs `unifi-ci` (reuses
   the read-only credential, capped at `[read, propose]` regardless).
2. **MCP client tier** (`full`/`propose`) — per network *caller*,
   layered above capability gating (see above).

Credential storage:
- **Dev machine**: plain files under `secrets/` (gitignored), one per
  credential — e.g. `secrets/unifi_password`,
  `secrets/portainer.token`.
- **The deployed `overseer-core` instance**: the *same* set of
  credentials, but SOPS-encrypted (age recipient) in a dedicated
  private Gitea repo (`overseer-secrets`), decrypted into the
  container's own `secrets/` directory by `docker/entrypoint.sh` at
  startup. Only two bootstrap secrets (an `age` private key, a
  read-only SSH deploy key for that repo) are placed directly onto the
  container's persistent volume — via Portainer's own container-archive
  API, never baked into the image or committed to git. Everything else
  (~14 real credentials, plus MCP client tokens) comes from the
  encrypted repo.

Nothing Overseer holds is ever the operator's own personal login —
every adapter and every MCP client has its own least-privilege
identity, separately provisioned.

## Creating a new managed application

```sh
overseer new-project <name> --port <port>
```

A **direct action** (not a lifecycle proposal — nothing pre-existing
can depend on a brand-new empty repo, so there's no meaningful
approval step to gate). Creates a real Gitea repo under the
`overseer-projects` org (owned outright by the `overseer-bot` account —
this specifically avoids Gitea's collaborator-vs-owner permission
friction hit earlier in this project's history), seeds it with:
- a `Dockerfile` (placeholder, meant to be replaced)
- `.gitea/workflows/deploy.yml` — on every push to `main`: build, test,
  push an image, then propose a deploy through Overseer using the
  `-ci`-scoped (propose-only) credentials
- `overseer-app.yaml` — the deploy manifest (image repo, port,
  hostname, `deploy.autoApproveRedeploy: false` by default)
- `README.md`

MCP equivalent: `new_project` tool.

## Deploying an application

```sh
overseer propose-deploy <manifestPath> --image <ref>
```

- **First deploy**: three separate, individually-reviewable proposals
  — the container, a UniFi static DNS record, and an Nginx Proxy
  Manager reverse-proxy host. Always needs manual approval.
- **Redeploy** of an already-running app: proposes only the container.
  **Auto-executes** only if *all three* hold: (1) the manifest sets
  `deploy.autoApproveRedeploy: true`, (2) a human separately approved a
  `delivery.set_auto_approve_redeploy` policy proposal for that exact
  project, (3) the new config is byte-identical to the last deploy
  except the image reference (checked in code, not assumed — a port or
  env change always falls back to requiring manual approval, even with
  the policy enabled).

MCP equivalents: `propose_deploy`, `propose_auto_approve_redeploy`.

## Scheduled monitoring & alerting

Runs automatically inside `overseer-core`, checking every 15 minutes,
comparing current state against recorded history (not just point-in-time
snapshots — this is what catches a drive that's suddenly wearing out
faster, or a port that keeps flapping, not just "is it down right
now").

**Current real checks** (`src/core/monitoring/checks.ts`,
`CHECK_REGISTRY`):
- `proxmox.disk-health` — temperature vs. each drive's own reported
  trip temperature, grown defects, reassigned blocks, sudden NVMe
  wearout drops.
- `unifi.port-flakiness` — per-port link state changes; escalates
  severity if the same port flaps repeatedly within a window. Muted
  from push notifications (see below) but still recorded.
- `unifi.device-health`, `portainer.container-health`,
  `nginx-proxy-manager.host-health` — thin wrappers around each
  adapter's existing health signal.

**Delivery**: a real push notification via the operator's Home
Assistant iOS Companion app (`notify.mobile_app_stuart_s_iphone_17_pro`),
for *new* alerts and *recoveries* only — an unchanged, already-open
condition never re-notifies (deduplication). Also always recorded to
the local audit log regardless of push delivery.

**Muting vs. deleting a check**: `config`'s `monitoring.mutedChecks`
list excludes a checkId from push notifications while it keeps running
and keeps recording real findings (still visible via `list_alerts`).
`unifi.port-flakiness` is muted because normal devices going to
sleep/waking up produce a real, single, clean port down/up transition
— indistinguishable from a genuine problem at the severity the check
originally used for every transition, and it was paging on every
routine standby cycle.

**Real incident, worth knowing about**: on first deployment
(2026-08-28), a fresh alert store meant every finding on the very
first tick counted as "new." One check
(`home-assistant.entity-health`, since removed entirely — see the
commented-out entry in `CHECK_REGISTRY`) was a blanket wrapper around
Home Assistant's generic per-entity health field and produced 575
findings, mostly iPhone Companion-app sensor noise, not real problems
— each one triggered a real push. ~90+ notifications landed on the
operator's phone in about a minute. The alerting pipeline itself
worked exactly as designed (dedup/cooldown/recovery were all fine on
every subsequent tick) — the failure was deploying an unreviewed
check's real output straight to live notification delivery. **Lesson,
now a standing practice**: always run `overseer monitoring run-once`
(or the `run_monitoring_checks` MCP tool) against real data and
actually read the output before adding any new check to
`CHECK_REGISTRY`.

Commands: `overseer monitoring run-once`, `overseer monitoring alerts
list [--status]`, `overseer monitoring alerts ack <id> --by <name>`,
`overseer monitoring alerts purge <checkId>` (cleans up a retired
check's stale rows — real capability, added after the incident above).
MCP equivalents: `run_monitoring_checks`, `list_alerts`,
`acknowledge_alert`, `purge_alerts_by_check`.

## Current real state (as of 2026-09-03)

- `overseer-core` running stably, image
  `gitea.internal:3000/overseer-bot/overseer-core:latest`, up several
  days without incident since the notification-flood fix.
- 13 open, legitimate monitoring alerts: 8 disk-temperature (the
  Seagate drives run above their own trip temperature — a known,
  accepted, cooling-related finding, not urgent; drive health itself
  is clean, zero defects/reassigned blocks), 4 UniFi device-health
  (long-offline devices, not new), 1 UniFi port-flakiness (muted from
  push, still recorded).
- Audit log hash chain verified intact.
- Every phase of the M7 CI/CD plan and the M8 monitoring plan is
  complete and has been verified against real infrastructure, not
  mocked.

## Where to go for more detail

If you have repo access: `CURRENT_STATE.md` (exact dated history and
verification evidence), `docs/operator-guide.md` (this doc's
repo-linked counterpart), `docs/credential-model.md`,
`docs/threat-model.md`, `docs/safety-and-approvals.md`,
`docs/network-model.md`, `docs/monitoring-and-alerting.md`,
`docs/ip-address-registry.md`, `docs/hardware-inventory.md`,
`docs/roadmap.md`.
