# Development

Node 22.13 or newer is required.

```sh
npm install
npm run dev
```

The normal local UI does not need infrastructure. To exercise durable capture,
configure a disposable PostgreSQL database and upload directory, run
`npm run db:migrate`, then start the app with `CAPTURE_API_ENABLED=true`.

Work on a short-lived branch. Keep `main` known-good, use Conventional Commits, and update `PROJECT_STATUS.md` and `LLM_HANDOFF.md` in every meaningful session.

Do not commit `.env` files, item images, database data, browser profiles, downloads, cookies, traces containing private page content, or credentials.
