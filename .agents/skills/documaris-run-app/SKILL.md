---
name: documaris-run-app
description: Run the documaris React/DuckDB WASM web app locally. Use when developing the app, testing form generation, or verifying changes to pipeline.ts or field maps.
license: Apache-2.0
compatibility: Requires Node.js >=20
metadata:
  repo: documaris
---

```bash
cd app
npm ci
npm run dev
```

App runs at `http://localhost:5173`.

Wrangler local emulation (with R2 mock) is not wired up — the app fetches live data from Cloudflare R2 in dev mode. To work offline, populate `app/src/lib/fixtures.ts` with mock data.

## Run tests

```bash
cd app && npm test
```

Runs Vitest unit tests for components and pipeline logic.
