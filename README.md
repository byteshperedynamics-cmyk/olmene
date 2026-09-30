# olmene

Worker serving **olmene.com** + **www.olmene.com**.

## How this works

- This repository is connected to Cloudflare Workers Builds.
- Every push to `main` automatically builds and deploys the Worker.
- `wrangler.jsonc` at the repo root is the deploy configuration.

## Develop

```bash
npm install        # installs wrangler
npx wrangler dev   # local dev at http://localhost:8787
```

Push to `main` to deploy. The worker code lives in `src/index.js`.
