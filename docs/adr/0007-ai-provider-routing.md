# ADR 0007: Provider-independent AI routing

- Status: Proposed
- Date: 2026-09-03

## Decision

Define task-level ports for vision, extraction, classification, reasoning and browser interpretation. Provider adapters may target OpenAI, Anthropic or OpenAI-compatible/local endpoints. Validate every model response against a versioned schema and record model, approximate cost and evidence lineage.

## Consequences

No domain workflow imports a provider SDK directly. Browser credentials and cookies are never model inputs. Deterministic code owns arithmetic, workflow and policy.
