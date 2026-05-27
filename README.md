# MyPurchase

MyPurchase is a Cloudflare-hosted receipt and shopping record tracker. It stores structured purchase data in D1, extracts receipt details with Workers AI, and generates monthly spending reports with deterministic totals plus AI advice.

## Stack

- Cloudflare Workers + Hono API
- Cloudflare D1 for structured records
- Cloudflare Workers AI for receipt extraction and report advice
- React + Vite frontend
- Vitest and Playwright test coverage

Receipt images are processed at request time only. This project does not persist receipt image blobs in D1 or R2/R1.

## Local setup

Install dependencies:

```bash
npm install
```

Run the local D1 migrations:

```bash
npm run db:migrate:local
```

Set the bootstrap admin password secret for local Wrangler:

```bash
wrangler secret put ADMIN_BOOTSTRAP_PASSWORD
```

Use this value for the first bootstrap login:

```text
yesasia
```

Start the app:

```bash
npm run dev
```

By default the dev server listens on `0.0.0.0:8787` so you can open it from the VM itself at `http://127.0.0.1:8787` or from another machine at `http://<your-public-ip>:8787`.

If the VM firewall is closed, allow TCP `8787`. For example with iptables:

```bash
sudo iptables -I INPUT -p tcp --dport 8787 -j ACCEPT
```

Check the API health route:

```bash
curl -i http://127.0.0.1:8787/api/health
```

Expected response body:

```json
{"ok":true}
```

## First login

Sign in with:

- Username: `admin`
- Password: the `ADMIN_BOOTSTRAP_PASSWORD` secret value

The first successful login creates the bootstrap admin user automatically. Change that password after first login.

## Tests

Run the unit and integration suite:

```bash
npm test
```

Run typecheck:

```bash
npm run typecheck
```

Build the production frontend bundle:

```bash
npm run build
```

Run the Playwright smoke test:

```bash
ADMIN_BOOTSTRAP_PASSWORD=yesasia npm run test:e2e
```

The Playwright config creates an isolated local D1 state under `.wrangler/state/e2e`, applies migrations there, writes a temporary `.dev.vars.e2e`, and starts Wrangler with the `ADMIN_BOOTSTRAP_PASSWORD` value from your shell for the smoke login.

## Cloudflare deployment

Create the D1 database:

```bash
wrangler d1 create mypurchase-db
```

Copy the returned `database_id` into `wrangler.jsonc`.

Apply remote migrations:

```bash
wrangler d1 migrations apply mypurchase-db --remote
```

Set the production bootstrap secret:

```bash
wrangler secret put ADMIN_BOOTSTRAP_PASSWORD
```

Use `yesasia` for the first deployment only, then change it after the admin signs in.

Deploy:

```bash
npm run deploy
```
