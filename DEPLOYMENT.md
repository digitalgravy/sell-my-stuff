# Deployment

Overseer is the only production deployment path.

The intended flow is: Gitea PR → merge to `main` → Gitea Actions quality gate → immutable container image in the local registry → deployment proposal in Overseer → human approval where required → health verification → GitHub mirror.

The first deployment requires separate container, DNS and reverse-proxy proposals. Application secrets are referenced by name in the deploy manifest and resolved by Overseer; they are never committed. Production version, image digest, Git commit, migration version and rollback target must be recorded.

The application is a standard self-hosted Next.js Node server built with
`output: 'standalone'`. The production image runs as the unprivileged `node`
user. Every checked-in migration under `drizzle/` is applied automatically by
`entrypoint.sh` on every container start (`dist/migrate.cjs`, bundled at build
time from `server/db/run-migrations.ts`) — a failed migration fails the
container's startup outright rather than letting the app or worker run
against a stale schema. No manual `db:migrate` step is needed for a deploy;
that script remains for local development only (see DEVELOPMENT.md). Before
enabling capture for the first time, provision PostgreSQL and a durable
upload volume, configure `DATABASE_URL` (or the discrete `DATABASE_HOST` /
`DATABASE_PORT` / `DATABASE_NAME` / `DATABASE_USER` / `DATABASE_PASSWORD`
vars) and `SELL_STORAGE_PATH`, and only then change `CAPTURE_API_ENABLED` to
`true` through the Overseer deployment flow.
