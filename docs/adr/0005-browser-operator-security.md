# ADR 0005: Browser session security and ownership

- Status: Proposed
- Date: 2026-09-03

## Decision

Run one persistent headed Chromium service with an isolated durable profile, virtual display and authenticated remote-view channel. Expose only a narrow deterministic action API. Session ownership is an explicit state machine: `AGENT_CONTROLLED`, `HUMAN_CONTROLLED`, `WAITING_FOR_HUMAN`, `RECONCILING_AFTER_HUMAN`, `IDLE`, `ERROR`.

## Constraints

Human input always wins. CAPTCHA/MFA pauses for takeover. No public CDP, cookies in application APIs, secrets in prompts, security-control bypass or blind resumption after takeover.

## Resolution (2026-09-05)

Streaming/control implementation: `x11vnc` bound to the Xvfb display, fronted
by `noVNC`/`websockify` for a browser-viewable remote session. Both are
mature, dependency-light and well-documented inside a Debian-based
Playwright container, and need nothing beyond a LAN-restricted port plus
Overseer/Nginx Proxy Manager's existing basic-auth pattern to satisfy
"authenticated remote-view channel" above — no new streaming stack to
build or maintain. Superseded the earlier open point; keep this section as
the record of that choice, not a question.
