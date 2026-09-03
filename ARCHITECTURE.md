# Architecture

## Shape

The first production shape is a modular monolith with explicit boundaries:

- Responsive Web/PWA: capture, tiny questions, review and lifecycle actions.
- Application API: server-owned items, evidence, approvals and revision control.
- Worker: durable, idempotent research stages and retries.
- PostgreSQL: authoritative structured state and job metadata.
- S3-compatible object storage: originals, derivatives and listing photos.
- Browser Operator: a later, separately deployed service with a persistent profile and exclusive control states.
- Adapters: AI, marketplace, manufacturer research, carrier and supplier boundaries.

This keeps Milestone 1 deployable without prematurely operating a fleet of services. The Browser Operator remains separate because its credential and remote-control risks are materially different.

## Core invariants

- The server is authoritative; browser storage is only a temporary capture queue or preference store.
- Important facts retain value, confidence, origin, evidence, source, retrieval time and confirmation state.
- LLM output is schema-validated and never silently promoted to confirmed marketplace copy.
- Deterministic code owns workflow transitions, valuation arithmetic, permissions and approval policy.
- Consequential external actions are idempotent and follow prepare → approve exact proposal → execute → verify → audit.
- Records carry revisions; stale writes fail rather than overwrite silently.

See `docs/adr/` for decisions and open questions.
