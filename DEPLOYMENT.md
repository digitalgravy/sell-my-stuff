# Deployment

Overseer is the only production deployment path.

The intended flow is: Gitea PR → merge to `main` → Gitea Actions quality gate → immutable container image in the local registry → deployment proposal in Overseer → human approval where required → health verification → GitHub mirror.

The first deployment requires separate container, DNS and reverse-proxy proposals. Application secrets are referenced by name in the deploy manifest and resolved by Overseer; they are never committed. Production version, image digest, Git commit, migration version and rollback target must be recorded.

The application is a standard self-hosted Next.js Node server built with
`output: 'standalone'`. The production image runs as the unprivileged `node`
user. Before enabling capture, provision PostgreSQL and a durable upload volume,
apply `drizzle/0000_equal_swarm.sql` with `npm run db:migrate`, configure
`DATABASE_URL` and `SELL_STORAGE_PATH`, and only then change
`CAPTURE_API_ENABLED` to `true` through the Overseer deployment flow.
