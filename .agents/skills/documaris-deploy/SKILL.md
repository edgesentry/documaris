---
name: documaris-deploy
description: Deploy the documaris app to Cloudflare Pages. Use when releasing a new version or verifying a deployment.
license: Apache-2.0
compatibility: Requires wrangler CLI and Cloudflare account credentials
metadata:
  repo: documaris
---

CI deploys automatically on push to `main` (`.github/workflows/deploy-app.yml`). Manual deploy:

```bash
cd app
npm ci
npm run build
wrangler pages deploy dist --project-name documaris
```

Live app: **https://documaris.pages.dev**

## R2 bucket

The app reads from the `documaris-dev-public` R2 bucket (written by indago pipelines). Bucket config is in `wrangler.toml`.
