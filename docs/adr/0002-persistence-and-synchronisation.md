# ADR 0002: Server-authoritative persistence and revisioned synchronisation

- Status: Proposed
- Date: 2026-09-03

## Decision

Prefer PostgreSQL for structured state, S3-compatible durable object storage for images and a database-backed durable job mechanism initially. Every mutable aggregate carries a monotonic revision. Server-sent events are the preferred first realtime transport.

## Rationale

The server must remain the source of truth across phone and desktop. PostgreSQL fits relational evidence, workflow, audit and approval data; SSE covers one-way progress updates with less operational surface than WebSockets.

## Open point

Confirm available managed storage, backup and restore conventions through live Overseer/infrastructure evidence before accepting this ADR.
