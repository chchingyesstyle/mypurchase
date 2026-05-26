# Shopping Records Cloudflare App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Cloudflare-hosted multi-user shopping records MVP with admin bootstrap auth, receipt/item storage in D1, session-only receipt AI extraction, and on-demand monthly AI reports.

**Architecture:** A single Cloudflare Worker serves static React assets and JSON API routes from the same origin. API modules are split by responsibility: auth, users, categories, receipts/items, budgets, AI extraction, and reports. D1 is the source of truth; uploaded images are validated, sent to Workers AI, and discarded without R1.

**Tech Stack:** Cloudflare Workers, Wrangler, D1, Workers AI binding, TypeScript, Hono, React, Vite, Vitest, Testing Library, Playwright, raw SQL migrations.

---

## File Structure

Create this project layout:

- `package.json`: scripts and dependencies for Worker, frontend, tests, and Playwright.
- `tsconfig.json`: shared TypeScript config.
- `vite.config.ts`: React build and Vitest config.
- `wrangler.jsonc`: Cloudflare Worker, assets, D1, and AI binding config.
- `migrations/0001_initial.sql`: D1 schema, indexes, and starter categories.
- `src/worker/index.ts`: Worker entrypoint and Hono app wiring.
- `src/worker/env.ts`: binding and runtime environment types.
- `src/worker/http.ts`: response helpers, validation errors, cookie helpers.
- `src/worker/security/passwords.ts`: PBKDF2 password hashing and verification.
- `src/worker/security/sessions.ts`: session creation, lookup, CSRF validation, auth middleware.
- `src/worker/repositories/*.ts`: focused D1 access modules for users, categories, receipts, budgets, reports.
- `src/worker/routes/*.ts`: focused API route modules.
- `src/worker/ai/extractReceipt.ts`: Workers AI receipt extraction adapter.
- `src/worker/ai/generateReportAdvice.ts`: Workers AI report-advice adapter.
- `src/worker/reports/summary.ts`: deterministic monthly summary builder.
- `src/shared/types.ts`: shared API/domain types used by Worker and React.
- `src/app/main.tsx`: React entrypoint.
- `src/app/App.tsx`: route shell and authenticated app layout.
- `src/app/api/client.ts`: browser API client with CSRF handling.
- `src/app/state/auth.tsx`: auth context.
- `src/app/pages/*.tsx`: login, dashboard, upload/review, records, reports, settings, admin users.
- `src/app/components/*.tsx`: reusable product UI components.
- `src/app/styles.css`: restrained product UI design system.
- `tests/worker/*.test.ts`: API and repository tests.
- `tests/app/*.test.tsx`: frontend flow tests.
- `tests/e2e/app.spec.ts`: Playwright smoke tests.

## Implementation Rules

- Commit after every task.
- Keep images request-scoped. Never add an R1 binding or table column for image bytes.
- Every D1 query touching user data must include `user_id`, except built-in category reads and admin user management.
- Keep AI model calls behind `src/worker/ai/*` adapters.
- Use cents/integer minor units for money in the database and shared API types.
- Use month keys in `YYYY-MM` format.

### Task 1: Scaffold Cloudflare Worker And React App

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `wrangler.jsonc`
- Create: `src/worker/index.ts`
- Create: `src/worker/env.ts`
- Create: `src/app/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/styles.css`
- Create: `index.html`
- Create: `tests/worker/health.test.ts`

- [ ] **Step 1: Write the failing health test**

Create `tests/worker/health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { app } from '../../src/worker/index';

const env = { ADMIN_BOOTSTRAP_PASSWORD: 'yesasia' } as never;

describe('health route', () => {
  it('returns ok JSON', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Create project config**

Create `package.json`:

```json
{
  "name": "mypurchase",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --ip 127.0.0.1 --port 8787",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate:local": "wrangler d1 migrations apply mypurchase-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply mypurchase-db --remote",
    "deploy": "npm run build && wrangler deploy"
  },
  "dependencies": {
    "@hono/zod-validator": "latest",
    "@vitejs/plugin-react": "latest",
    "hono": "latest",
    "lucide-react": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "latest",
    "@playwright/test": "latest",
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest",
    "wrangler": "latest"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "skipLibCheck": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: []
  }
});
```

Create `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mypurchase",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-05-26",
  "assets": {
    "directory": "dist/client",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mypurchase-db",
      "database_id": "00000000-0000-0000-0000-000000000000"
    }
  ],
  "ai": {
    "binding": "AI"
  },
  "vars": {
    "APP_ENV": "local"
  }
}
```

- [ ] **Step 3: Implement minimal Worker and app shell**

Create `src/worker/env.ts`:

```ts
export type AppEnv = {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  ADMIN_BOOTSTRAP_PASSWORD: string;
  APP_ENV?: string;
};
```

Create `src/worker/index.ts`:

```ts
import { Hono } from 'hono';
import type { AppEnv } from './env';

export const app = new Hono<{ Bindings: AppEnv }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('*', async (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MyPurchase</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

Create `src/app/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">MyPurchase</p>
        <h1>Shopping records</h1>
        <p>Upload receipts, review line items, and understand monthly spending.</p>
      </section>
    </main>
  );
}
```

Create `src/app/styles.css`:

```css
:root {
  color-scheme: light;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: oklch(97% 0.006 210);
  color: oklch(24% 0.015 230);
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
button, input, select, textarea { font: inherit; }
.app-shell { min-height: 100vh; padding: 32px; display: grid; place-items: center; }
.panel { max-width: 680px; width: 100%; border: 1px solid oklch(88% 0.012 230); border-radius: 8px; padding: 28px; background: oklch(99% 0.004 210); }
.eyebrow { margin: 0 0 8px; color: oklch(46% 0.07 210); font-weight: 700; }
h1 { margin: 0 0 12px; font-size: 2rem; line-height: 1.15; letter-spacing: 0; }
p { line-height: 1.55; }
```

- [ ] **Step 4: Run verification**

Run: `npm install`

Expected: dependencies install without errors.

Run: `npm run typecheck`

Expected: TypeScript passes.

Run: `npm test -- tests/worker/health.test.ts`

Expected: the health test passes.

Run: `npm run build`

Expected: Vite build completes and writes `dist/client`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts wrangler.jsonc index.html src tests
git commit -m "feat: scaffold Cloudflare Worker app"
```

### Task 2: Add D1 Schema And Repository Test Harness

**Files:**
- Create: `migrations/0001_initial.sql`
- Create: `src/shared/types.ts`
- Create: `src/worker/repositories/db.ts`
- Create: `src/worker/repositories/categories.ts`
- Create: `tests/worker/schema.test.ts`

- [ ] **Step 1: Write schema test**

Create `tests/worker/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import migrationSql from '../../migrations/0001_initial.sql?raw';

const required = [
  'CREATE TABLE users',
  'CREATE TABLE sessions',
  'CREATE TABLE categories',
  'CREATE TABLE receipts',
  'CREATE TABLE receipt_items',
  'CREATE TABLE budgets',
  'CREATE TABLE monthly_reports',
  'CREATE TABLE user_month_versions',
  'CREATE TABLE audit_log',
  'CREATE UNIQUE INDEX users_username_unique',
  'CREATE INDEX receipts_user_purchase_date_idx',
  'CREATE UNIQUE INDEX monthly_reports_user_month_unique'
];

describe('initial D1 migration', () => {
  it('defines the required tables and indexes', () => {
    for (const token of required) {
      expect(migrationSql).toContain(token);
    }
  });

  it('seeds built-in categories in the migration', () => {
    expect(migrationSql).toContain("('Groceries'");
    expect(migrationSql).toContain("('Household'");
    expect(migrationSql).toContain("('Online shopping'");
  });
});
```

- [ ] **Step 2: Add shared types**

Create `src/shared/types.ts`:

```ts
export type Role = 'admin' | 'user';
export type Money = number;
export type MonthKey = `${number}-${string}`;

export type User = {
  id: string;
  username: string;
  role: Role;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  userId: string | null;
  name: string;
  kind: 'built_in' | 'custom';
  color: string;
  icon: string;
  createdAt: string;
};

export type ReceiptItemInput = {
  id?: string;
  name: string;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
  categoryId: string | null;
};

export type ReceiptInput = {
  merchant: string;
  purchaseDate: string;
  currency: string;
  subtotal: Money | null;
  tax: Money | null;
  discount: Money | null;
  total: Money;
  categoryId: string | null;
  notes: string | null;
  sourceType: 'manual' | 'receipt_image';
  items: ReceiptItemInput[];
};
```

- [ ] **Step 3: Create migration**

Create `migrations/0001_initial.sql` with the schema from the design spec. Use `TEXT` IDs, `INTEGER` money amounts in minor units, `CHECK` constraints for roles/kinds, foreign keys with `ON DELETE CASCADE`, and the indexes listed in the spec.

The migration must include these starter categories with `user_id NULL` and `kind = 'built_in'`: Groceries, Household, Personal care, Clothing, Electronics, Dining, Transport, Health, Gifts, Online shopping, Other.

- [ ] **Step 4: Add small DB helpers**

Create `src/worker/repositories/db.ts`:

```ts
export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function rowToCamel<T extends Record<string, unknown>>(row: T) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value])
  );
}
```

Create `src/worker/repositories/categories.ts`:

```ts
import type { Category } from '../../shared/types';
import { rowToCamel } from './db';

export async function listVisibleCategories(db: D1Database, userId: string): Promise<Category[]> {
  const result = await db
    .prepare('SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY user_id IS NOT NULL, name')
    .bind(userId)
    .all<Record<string, unknown>>();
  return result.results.map((row) => rowToCamel(row) as Category);
}
```

- [ ] **Step 5: Run verification and commit**

Run: `npm test -- tests/worker/schema.test.ts`

Expected: migration test passes.

Run: `npm run typecheck`

Expected: TypeScript passes.

Commit:

```bash
git add migrations src/shared src/worker/repositories tests/worker/schema.test.ts
git commit -m "feat: add D1 schema and repository foundation"
```

### Task 3: Implement Bootstrap Admin Auth And Sessions

**Files:**
- Create: `src/worker/security/passwords.ts`
- Create: `src/worker/security/sessions.ts`
- Create: `src/worker/repositories/users.ts`
- Create: `src/worker/routes/auth.ts`
- Modify: `src/worker/index.ts`
- Test: `tests/worker/auth.test.ts`

- [ ] **Step 1: Write auth tests**

Create `tests/worker/auth.test.ts` with tests for: `POST /api/auth/login` creates bootstrap admin when username is `admin` and password matches `ADMIN_BOOTSTRAP_PASSWORD`; wrong password returns 401; `GET /api/auth/me` returns the user when session cookie is present; `POST /api/auth/logout` clears the cookie.

Use a D1 test database from the Workers Vitest pool when implementing. If the test harness cannot apply migrations automatically, add a helper that executes each SQL statement from `migrations/0001_initial.sql` before each test.

- [ ] **Step 2: Implement password hashing**

Create `src/worker/security/passwords.ts`:

```ts
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;

function bytesToBase64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_LENGTH * 8);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2_sha256$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterationText, saltText, hashText] = stored.split('$');
  if (scheme !== 'pbkdf2_sha256') return false;
  const expected = base64ToBytes(hashText);
  const actual = new Uint8Array(await pbkdf2(password, base64ToBytes(saltText), Number(iterationText)));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
```

- [ ] **Step 3: Implement users and sessions**

Create `src/worker/repositories/users.ts` with `findUserByUsername`, `findUserById`, `countAdmins`, `createUser`, and `listUsersForAdmin`. Create `src/worker/security/sessions.ts` with `createSession`, `getCurrentUser`, `requireUser`, `requireAdmin`, and `requireCsrf`.

Session cookie name: `mp_session`. CSRF header: `x-csrf-token`. Session TTL: 14 days.

- [ ] **Step 4: Implement auth routes**

Create `src/worker/routes/auth.ts` with:

- `POST /login`: bootstrap admin if no admin exists and credentials match username `admin` plus `ADMIN_BOOTSTRAP_PASSWORD`.
- `POST /logout`: deletes current session if present.
- `GET /me`: returns current user and CSRF token.
- `POST /password`: authenticated password change.

Mount it in `src/worker/index.ts` at `/api/auth`.

- [ ] **Step 5: Run verification and commit**

Run: `npm test -- tests/worker/auth.test.ts`

Expected: auth tests pass.

Run: `npm run typecheck`

Expected: TypeScript passes.

Commit:

```bash
git add src/worker tests/worker/auth.test.ts
git commit -m "feat: add bootstrap admin auth"
```

### Task 4: Implement Admin User Management, Categories, And Budgets APIs

**Files:**
- Create: `src/worker/routes/users.ts`
- Create: `src/worker/routes/categories.ts`
- Create: `src/worker/routes/budgets.ts`
- Create: `src/worker/repositories/budgets.ts`
- Modify: `src/worker/repositories/categories.ts`
- Modify: `src/worker/index.ts`
- Test: `tests/worker/users-categories-budgets.test.ts`

- [ ] **Step 1: Write tests**

Create tests that prove: admin can create users; normal users cannot create users; users see built-in and own categories only; users cannot edit another user's custom category; budgets are scoped by `user_id`; budget month must match `YYYY-MM`.

- [ ] **Step 2: Implement routes**

Add:

- `GET /api/users` admin only.
- `POST /api/users` admin only, username/password/default currency/role.
- `GET /api/categories` authenticated.
- `POST /api/categories` authenticated custom category.
- `PATCH /api/categories/:id` owner only.
- `DELETE /api/categories/:id` owner only.
- `GET /api/budgets?month=YYYY-MM` authenticated.
- `PUT /api/budgets/:categoryId/:month` authenticated.
- `DELETE /api/budgets/:categoryId/:month` authenticated.

Use Zod schemas in route files. Return 400 for validation errors, 401 for unauthenticated, 403 for forbidden, 404 for hidden/missing owned resources.

- [ ] **Step 3: Run verification and commit**

Run: `npm test -- tests/worker/users-categories-budgets.test.ts`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: TypeScript passes.

Commit:

```bash
git add src/worker tests/worker/users-categories-budgets.test.ts
git commit -m "feat: add user category and budget APIs"
```

### Task 5: Implement Receipt And Item APIs With Report Versioning

**Files:**
- Create: `src/worker/repositories/receipts.ts`
- Create: `src/worker/routes/receipts.ts`
- Modify: `src/worker/index.ts`
- Test: `tests/worker/receipts.test.ts`

- [ ] **Step 1: Write receipt tests**

Test: create receipt with two item lines; list receipts only returns current user's data; detail includes items; update replaces item lines; delete removes receipt and item lines; create/update/delete increments `user_month_versions.records_version` for the affected month; moving a receipt to another month increments both old and new months.

- [ ] **Step 2: Implement repository**

Implement `createReceipt`, `listReceipts`, `getReceiptDetail`, `updateReceipt`, `deleteReceipt`, and `incrementMonthVersion`. Use D1 batches where a receipt and item lines change together. Store money values as integer minor units.

- [ ] **Step 3: Implement routes**

Add:

- `GET /api/receipts?month=&merchant=&categoryId=&q=`
- `POST /api/receipts`
- `GET /api/receipts/:id`
- `PUT /api/receipts/:id`
- `DELETE /api/receipts/:id`

Validate that totals are integers, currency is 3 uppercase letters, purchase date is `YYYY-MM-DD`, and item totals are non-negative integers.

- [ ] **Step 4: Run verification and commit**

Run: `npm test -- tests/worker/receipts.test.ts`

Expected: all receipt tests pass.

Run: `npm run typecheck`

Expected: TypeScript passes.

Commit:

```bash
git add src/worker tests/worker/receipts.test.ts
git commit -m "feat: add receipt and item APIs"
```

### Task 6: Add Workers AI Receipt Extraction Endpoint

**Files:**
- Create: `src/worker/ai/extractReceipt.ts`
- Create: `src/worker/routes/extraction.ts`
- Modify: `src/worker/index.ts`
- Test: `tests/worker/extraction.test.ts`

- [ ] **Step 1: Write extraction tests**

Test: unauthenticated upload returns 401; non-image upload returns 400; oversized upload returns 413; valid image calls `env.AI.run`; response is normalized into an editable draft; no route writes image bytes or receipt rows to D1.

- [ ] **Step 2: Implement AI adapter**

Create `src/worker/ai/extractReceipt.ts` exporting `extractReceiptDraft(ai, imageBytes, mimeType)`. It should call one vision/image-to-text model through `ai.run`, request JSON fields from the design spec, parse the model response defensively, and return fallback empty fields when optional values are absent.

Normalize money strings into integer minor units in the route, not in UI.

- [ ] **Step 3: Implement route**

Add `POST /api/extract-receipt` accepting multipart form field `receipt`. Limit file size to 8 MB in application code even though Cloudflare Free allows larger request bodies. Accept `image/jpeg`, `image/png`, `image/webp`, and `image/heic` only if Workers AI model support is confirmed during implementation; otherwise return 400 for unsupported types.

- [ ] **Step 4: Run verification and commit**

Run: `npm test -- tests/worker/extraction.test.ts`

Expected: all extraction tests pass with a mocked AI binding.

Run: `npm run typecheck`

Expected: TypeScript passes.

Commit:

```bash
git add src/worker tests/worker/extraction.test.ts
git commit -m "feat: add receipt AI extraction endpoint"
```

### Task 7: Implement Monthly Summary And AI Report APIs

**Files:**
- Create: `src/worker/reports/summary.ts`
- Create: `src/worker/ai/generateReportAdvice.ts`
- Create: `src/worker/repositories/reports.ts`
- Create: `src/worker/routes/reports.ts`
- Modify: `src/worker/index.ts`
- Test: `tests/worker/reports.test.ts`

- [ ] **Step 1: Write report tests**

Test: summary totals by category and merchant; item-level recurring purchases detected by normalized item name; budget progress calculated; cached report reused when `records_version` matches; AI regenerated when version changes; users cannot read another user's report.

- [ ] **Step 2: Implement deterministic summary**

Create `buildMonthlySummary({ receipts, items, budgets, previousMonthReceipts })`. It returns JSON with totals, category totals, merchant totals, item totals, recurring item candidates, unusual merchant/category increases, budget status, and previous-month comparisons. It must work without AI.

- [ ] **Step 3: Implement report advice adapter**

Create `generateReportAdvice(ai, summary)`. Prompt Workers AI to return JSON with: `overview`, `savingOpportunities`, `budgetWarnings`, `recurringNotes`, `itemInsights`, `nextMonthSuggestions`. Keep prompt input to deterministic summary only.

- [ ] **Step 4: Implement routes**

Add:

- `GET /api/reports/:month`: returns cached report when current.
- `POST /api/reports/:month/generate`: builds summary, calls AI, stores report with current `records_version`, returns report.

If AI fails, return deterministic summary with `aiStatus: "failed"` and no saved stale advice.

- [ ] **Step 5: Run verification and commit**

Run: `npm test -- tests/worker/reports.test.ts`

Expected: report tests pass.

Run: `npm run typecheck`

Expected: TypeScript passes.

Commit:

```bash
git add src/worker tests/worker/reports.test.ts
git commit -m "feat: add monthly report generation"
```

### Task 8: Build Authenticated Frontend Shell

**Files:**
- Create: `src/app/api/client.ts`
- Create: `src/app/state/auth.tsx`
- Create: `src/app/components/Button.tsx`
- Create: `src/app/components/Layout.tsx`
- Create: `src/app/pages/LoginPage.tsx`
- Create: `src/app/pages/DashboardPage.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`
- Test: `tests/app/auth-shell.test.tsx`

- [ ] **Step 1: Write frontend auth shell tests**

Test: unauthenticated users see login; login form posts username/password; authenticated users see dashboard navigation; admin users see admin nav item; CSRF token is sent on mutating API calls.

- [ ] **Step 2: Implement API client and auth context**

`client.ts` should wrap `fetch`, parse JSON, include credentials, and add `x-csrf-token` for mutating calls. `auth.tsx` should load `/api/auth/me`, expose `login`, `logout`, `user`, `csrfToken`, and loading state.

- [ ] **Step 3: Implement product UI shell**

Use a restrained light design, left nav on desktop, compact nav on mobile, and lucide icons for nav/actions. Avoid landing-page content. Dashboard shows this month total summary, recent records summary, upload action, and report action.

- [ ] **Step 4: Run verification and commit**

Run: `npm test -- tests/app/auth-shell.test.tsx`

Expected: frontend auth shell tests pass.

Run: `npm run build`

Expected: app builds.

Commit:

```bash
git add src/app tests/app/auth-shell.test.tsx
git commit -m "feat: add authenticated frontend shell"
```

### Task 9: Build Upload, Review, Records, And Settings UI

**Files:**
- Create: `src/app/pages/UploadPage.tsx`
- Create: `src/app/pages/RecordsPage.tsx`
- Create: `src/app/pages/ReceiptDetailPage.tsx`
- Create: `src/app/pages/CategoriesPage.tsx`
- Create: `src/app/pages/BudgetsPage.tsx`
- Create: `src/app/pages/AdminUsersPage.tsx`
- Create: `src/app/components/ReceiptEditor.tsx`
- Create: `src/app/components/DataTable.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`
- Test: `tests/app/receipt-flow.test.tsx`

- [ ] **Step 1: Write receipt flow tests**

Test: upload page validates file before submit; successful extraction populates receipt editor; user can edit merchant and item line; save calls `POST /api/receipts`; records page renders returned receipts; settings pages call category, budget, and admin user APIs.

- [ ] **Step 2: Implement receipt editor**

Build `ReceiptEditor` with receipt fields at top and editable item-line table below. Include add/remove item row controls, category selectors, currency input, and total fields. Preserve draft data in component state if save fails.

- [ ] **Step 3: Implement pages**

Wire pages to API routes. Keep empty states practical: records empty state links to upload; categories empty state still shows built-in categories; budgets page defaults to current month.

- [ ] **Step 4: Run verification and commit**

Run: `npm test -- tests/app/receipt-flow.test.tsx`

Expected: receipt flow tests pass.

Run: `npm run build`

Expected: build succeeds.

Commit:

```bash
git add src/app tests/app/receipt-flow.test.tsx
git commit -m "feat: add receipt management UI"
```

### Task 10: Build Monthly Report UI

**Files:**
- Create: `src/app/pages/ReportPage.tsx`
- Create: `src/app/components/ReportCharts.tsx`
- Create: `src/app/components/AdviceBlock.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`
- Test: `tests/app/report-page.test.tsx`

- [ ] **Step 1: Write report UI tests**

Test: page loads cached report; generate button calls `POST /api/reports/:month/generate`; deterministic totals render even when `aiStatus` is failed; advice sections render when present; month selector uses `YYYY-MM`.

- [ ] **Step 2: Implement report page**

Show month selector, generate/regenerate button, total spend, category breakdown, merchant breakdown, budget status, recurring purchases, item insights, and AI advice blocks. Numbers must remain visible beside advice.

- [ ] **Step 3: Run verification and commit**

Run: `npm test -- tests/app/report-page.test.tsx`

Expected: report page tests pass.

Run: `npm run build`

Expected: build succeeds.

Commit:

```bash
git add src/app tests/app/report-page.test.tsx
git commit -m "feat: add monthly report UI"
```

### Task 11: End-To-End Verification, Local Run, And Deployment Notes

**Files:**
- Create: `tests/e2e/app.spec.ts`
- Create: `playwright.config.ts`
- Create: `README.md`
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Add Playwright smoke test**

Create `tests/e2e/app.spec.ts` to verify: login screen loads; admin bootstrap login works in local dev with `ADMIN_BOOTSTRAP_PASSWORD=yesasia`; dashboard loads; navigation to upload, records, reports, settings works.

- [ ] **Step 2: Add README**

Document:

```bash
npm install
npm run db:migrate:local
wrangler secret put ADMIN_BOOTSTRAP_PASSWORD
npm run dev
```

Also document Cloudflare setup:

```bash
wrangler d1 create mypurchase-db
# copy database_id into wrangler.jsonc
wrangler d1 migrations apply mypurchase-db --remote
wrangler secret put ADMIN_BOOTSTRAP_PASSWORD
npm run deploy
```

State clearly that the secret value requested for the first deployment is `yesasia`, and that it should be changed after first login.

- [ ] **Step 3: Run final verification**

Run:

```bash
npm run typecheck
npm test
npm run build
npm run db:migrate:local
npm run dev
```

Expected: typecheck passes, tests pass, build succeeds, local migration succeeds, and Wrangler dev serves the app at `http://127.0.0.1:8787`.

Run in a second terminal:

```bash
curl -i http://127.0.0.1:8787/api/health
```

Expected: HTTP 200 with `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add README.md playwright.config.ts tests/e2e wrangler.jsonc
git commit -m "test: add e2e smoke coverage and deployment docs"
```

## Final Review Checklist

- [ ] `rg -n "R1|receipt_image_bytes|image_data|base64_image" src migrations` finds no persisted image storage.
- [ ] `rg -n "ADMIN_BOOTSTRAP_PASSWORD|yesasia" .` shows the secret name in code/docs and the literal `yesasia` only in docs, not in source or config.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run db:migrate:local` passes.
- [ ] App works at desktop and mobile viewport widths.
- [ ] `git status --short` shows a clean worktree after final commit.
