# ADR 0008: Browser Operator deployment on Jupiter infrastructure

- Status: Proposed
- Date: 2026-09-03

## Decision

Deploy the Browser Operator as a long-running Overseer-managed container on the existing Docker host running on Jupiter, with persistent encrypted-at-rest profile storage where practical, health checks and a LAN-only authenticated control/view surface.

## Rationale

The session must survive client-device changes and application restarts while remaining invisible to the public internet.

## Resolution (2026-09-05)

Deployed as its own Overseer-managed project, `sell-browser` — a separate
Gitea repo/CI/deploy manifest from `sell-my-stuff`, per the brief's
conceptual service split (`sell-web`/`sell-worker`/`sell-browser`/...) and
consistent with how Overseer's `new-project` tooling is meant to be used
(one project per deployable). It runs on the same Jupiter-hosted Docker
infrastructure as `sell-my-stuff`, not the separate always-on macOS
machine — confirmed with the project owner (2026-09-05) that "Jupiter" in
this ADR's title refers to the Proxmox host running the existing
Docker/Portainer stack, not a physical machine dedicated to the browser.
The Mac remains a possible future fallback only if headed Chromium in
Docker proves unreliable against eBay's bot detection.

- **Storage mount**: `container.volumes` (`hostPath`/`containerPath`/
  `readOnly`) in `overseer-app.yaml` — the same manifest field
  `sell-my-stuff` itself is using for durable photo uploads. This is a
  host-path bind mount, not an opaque named Docker volume, so the host
  path is dedicated solely to this container and nothing else, kept
  distinct from `sell-my-stuff`'s own upload path.
- **Stream technology**: see ADR 0005's resolution (`x11vnc` + noVNC).
- **Network address**: LAN-only, no public exposure — no Nginx Proxy
  Manager host with `exposeExternally: true`, matching `sell-my-stuff`'s
  own `network.exposeExternally: false` convention.
- **Filesystem permissions**: the host directory should be created with
  permissions restricted to whatever user Docker/Portainer runs
  containers as, not world-readable — confirm the concrete mode when the
  real host path is provisioned (`sell-browser`'s `overseer-app.yaml`
  currently has a placeholder path, not a verified one).

Remaining open point: whether the internal action API and the noVNC port
need separate container ports in the manifest, or can share one behind a
path prefix — settle this when writing the manifest during
implementation, not before.
