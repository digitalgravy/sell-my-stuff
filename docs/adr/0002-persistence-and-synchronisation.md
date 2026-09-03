# ADR 0002: Server-authoritative persistence and revisioned synchronisation

- Status: Accepted
- Date: 2026-09-03

## Decision

Use PostgreSQL for structured state and the initial durable job mechanism. Store images through an object-store interface; the first implementation uses an isolated durable filesystem volume, while retaining the option to add S3-compatible storage without changing domain code. Every mutable aggregate carries a monotonic revision. Server-sent events are the preferred first realtime transport.

## Rationale

The server must remain the source of truth across phone and desktop. PostgreSQL fits relational evidence, workflow, audit and approval data; SSE covers one-way progress updates with less operational surface than WebSockets. Live infrastructure inspection found no existing PostgreSQL, Redis or S3-compatible service to reuse. A single-host durable filesystem adapter is the smallest honest first step and avoids inventing an unprovisioned dependency.

## Consequences

Overseer must provision PostgreSQL and a dedicated upload volume before capture is enabled. The volume needs an explicit backup and restore policy. The database transaction and object write cannot be atomic together, so failed metadata transactions perform compensating object deletion and orphan reconciliation remains future hardening. Multi-instance deployment requires moving to shared object storage and coordinating Next.js caches.
