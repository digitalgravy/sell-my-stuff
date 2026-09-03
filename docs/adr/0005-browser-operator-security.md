# ADR 0005: Browser session security and ownership

- Status: Proposed
- Date: 2026-09-03

## Decision

Run one persistent headed Chromium service with an isolated durable profile, virtual display and authenticated remote-view channel. Expose only a narrow deterministic action API. Session ownership is an explicit state machine: `AGENT_CONTROLLED`, `HUMAN_CONTROLLED`, `WAITING_FOR_HUMAN`, `RECONCILING_AFTER_HUMAN`, `IDLE`, `ERROR`.

## Constraints

Human input always wins. CAPTCHA/MFA pauses for takeover. No public CDP, cookies in application APIs, secrets in prompts, security-control bypass or blind resumption after takeover.

## Open point

Select the streaming/control implementation after a deployment proof on the existing Docker host.
