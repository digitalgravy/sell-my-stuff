# ADR 0008: Browser Operator deployment on Jupiter infrastructure

- Status: Proposed
- Date: 2026-09-03

## Decision

Deploy the Browser Operator as a long-running Overseer-managed container on the existing Docker host running on Jupiter, with persistent encrypted-at-rest profile storage where practical, health checks and a LAN-only authenticated control/view surface.

## Rationale

The session must survive client-device changes and application restarts while remaining invisible to the public internet.

## Open point

Confirm storage mount, backup exclusions, network address, stream technology and restrictive filesystem permissions during Milestone 2 design.
