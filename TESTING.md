# Testing

Run the fast local gate with:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The target test pyramid includes deterministic unit tests, API/database and storage integration tests, component/accessibility tests, local-fixture Browser Operator tests, and a small set of mobile/desktop E2E journeys. Live marketplace tests must be isolated, read-only by default and never use production publication approval.
