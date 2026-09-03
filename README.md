# Sell My Stuff

Sell My Stuff is a self-hosted AI assistant that turns photographs of unwanted possessions into researched, reviewable sale proposals and—only after explicit approval—performs and verifies the selling work.

The project is at foundation stage. The application provides the intended low-friction, multi-photo intake experience, and its server-owned persistence contract is implemented behind a deployment feature gate. Production database/storage provisioning and AI research are the next vertical slice.

## Development

```sh
npm install
npm run dev
```

Quality checks:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The capture API needs `DATABASE_URL` and `SELL_STORAGE_PATH`. Keep
`CAPTURE_API_ENABLED=false` until the database migration has been applied and the
storage path is mounted on durable, backed-up storage.

Start with `BRIEF.md`, then read `PROJECT_STATUS.md`, `ROADMAP.md` and `LLM_HANDOFF.md`.
