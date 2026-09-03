# ADR 0004: Overseer-managed CI/CD and infrastructure

- Status: Accepted
- Date: 2026-09-03

## Decision

Gitea is the development authority. Gitea Actions builds, tests and pushes immutable images, then uses propose-only Overseer credentials to propose deployment. Overseer provisions and manages the container, DNS and reverse proxy. GitHub mirrors approved `main`.

## Rationale

This reuses the homelab's existing least-privilege, proposal, approval, execution and audit controls. The application will not create a parallel deployment plane.

## Consequences

First deployment requires three human-approved proposals. Secrets are referenced in `overseer-app.yaml` and resolved outside the repository.
