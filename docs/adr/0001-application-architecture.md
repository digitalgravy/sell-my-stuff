# ADR 0001: Modular monolith with isolated browser operator

- Status: Proposed
- Date: 2026-09-03

## Decision

Begin with one responsive web/API application and one durable worker sharing explicit domain modules. Deploy the Browser Operator as a separate service when Milestone 2 starts.

## Rationale

This minimises operational complexity for the first vertical slice while preserving the strongest security boundary. External systems remain behind adapters so processes can split later without rewriting domain policy.

## Consequences

Module boundaries and job contracts must be enforced in code. The Browser Operator cannot share a public API surface, filesystem profile or unrestricted control channel with the web process.
