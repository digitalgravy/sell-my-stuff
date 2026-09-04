# Development

Node 22.13 or newer is required.

```sh
npm install
npm run dev
```

The normal local UI does not need infrastructure. To exercise durable capture,
configure a disposable PostgreSQL database and upload directory, run
`npm run db:migrate`, then start the app with `CAPTURE_API_ENABLED=true`.
Run `npm run worker:dev` for the source-mode inspection worker. A normal
`npm run build` also creates `dist/worker.mjs`, which `npm run worker` executes.
`worker:dev` reads `.env.local` itself (via Node's `--env-file-if-exists`) for
`ANTHROPIC_API_KEY`/`DATABASE_URL` — unlike `next dev`, a plain Node/tsx
process doesn't auto-load `.env.local`, so without this flag the worker
fails with a "not configured" error even when the file has the right values.

`server/ai/heic-photo-converter.ts` converts HEIC/HEIF photos to JPEG before
they reach the vision provider. Its real-decode test is skipped by default;
point `HEIC_TEST_FIXTURE` at a local `.heic` file to run it:
`HEIC_TEST_FIXTURE=/path/to/photo.heic npm test`.

Work on a short-lived branch. Keep `main` known-good, use Conventional Commits, and update `PROJECT_STATUS.md` and `LLM_HANDOFF.md` in every meaningful session.

Do not commit `.env` files, item images, database data, browser profiles, downloads, cookies, traces containing private page content, or credentials.
