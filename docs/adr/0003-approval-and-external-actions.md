# ADR 0003: Exact-proposal approval for consequential actions

- Status: Accepted
- Date: 2026-09-03

## Decision

Search, inspection, valuation and draft preparation may run autonomously. Publishing, scheduling, material live-listing edits, offer actions, purchases, refunds and cancellations require explicit approval of the exact commercial proposal. A material deviation invalidates approval. Every execution is idempotent and independently verified.

## Rationale

This preserves user agency across API and browser mechanisms and prevents automation mechanism from weakening policy.
