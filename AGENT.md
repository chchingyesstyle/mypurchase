# AGENT

## Purpose

This repository hosts `MyPurchase`, a Cloudflare Worker application for receipt capture, shopping record storage, and monthly spending reports.

The app uses:

- Cloudflare Workers for the API and app hosting
- Cloudflare D1 for structured data
- Cloudflare Workers AI for receipt extraction and report advice
- React + Vite for the frontend

## Current production

- Production domain: `https://pur.cchk.uk`
- Worker name: `mypurchase`
- Production D1 database name: `mypurchase-db`
- Production route is configured in `wrangler.jsonc`

Treat `wrangler.jsonc` as live infrastructure config, not sample config.

## Deployment rules

- Production deploys are handled by GitHub Actions on push to `main`.
- The workflow file is `.github/workflows/deploy.yml`.
- Manual deploys are still possible with `npm run deploy`, but prefer the GitHub workflow for normal changes.
- Remote schema changes must be applied before deploy. The workflow already runs `npm run db:migrate:remote`.

## Critical guardrails

- Do not recreate the production D1 database for routine changes.
- Do not replace the `database_id` in `wrangler.jsonc` unless intentionally moving production to a new database.
- Do not change the production route `pur.cchk.uk` unless explicitly requested.
- Do not commit secrets.
- Do not store receipt image blobs in D1, R2, or other persistent storage unless the product direction changes.

## Secrets

Required Cloudflare Worker secret:

- `ADMIN_BOOTSTRAP_PASSWORD`

Required GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The bootstrap admin password is environment-managed. Do not hardcode it in source.

## Local development

Useful commands:

```bash
npm install
npm run db:migrate:local
npm run dev
```

The local dev server listens on `0.0.0.0:8787`.

Useful verification commands:

```bash
npm run typecheck
npm test
npm run build
ADMIN_BOOTSTRAP_PASSWORD=... npm run test:e2e
curl -i http://127.0.0.1:8787/api/health
```

## AI model usage

Current Workers AI models:

- Receipt extraction: `@cf/meta/llama-3.2-11b-vision-instruct`
- Report advice: `@cf/meta/llama-3.1-8b-instruct`

If changing models, review Cloudflare pricing, limits, and deprecation status first.

## Password hashing note

Cloudflare Workers rejected PBKDF2 iteration counts above `100000` in production for this app.

Current password hashing uses a Cloudflare-compatible PBKDF2 iteration count. Do not raise it above the runtime-supported limit without verifying support in production first.

## Testing expectations

Before shipping code that affects behavior, run:

```bash
npm run typecheck
npm test
npm run build
```

When auth, routing, or deploy behavior changes, also run:

```bash
ADMIN_BOOTSTRAP_PASSWORD=... npm run test:e2e
```

## Documentation expectations

- Keep `README.md` user-facing.
- Keep `AGENT.md` operational and maintenance-focused.
- If infrastructure changes, update both files when relevant.
