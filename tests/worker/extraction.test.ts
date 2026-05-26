// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { Miniflare } from 'miniflare';
import type { AppEnv } from '../../src/worker/env';
import { app } from '../../src/worker/index';
import { hashPassword } from '../../src/worker/security/passwords';

const migrationsPromise = readD1Migrations('migrations');
const now = '2026-05-26T00:00:00.000Z';
let miniflare: Miniflare | undefined;
let env: AppEnv;
let aiRun: ReturnType<typeof vi.fn>;

function unusedBinding<T>(name: string): T {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`${name} binding is not available in this test`);
      }
    }
  ) as T;
}

async function createDb() {
  miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } };',
    d1Databases: ['DB']
  });
  const db = await miniflare.getD1Database('DB');
  const migrations = await migrationsPromise;
  for (const migration of migrations) {
    for (const query of migration.queries) {
      await db.prepare(query).run();
    }
  }
  return db;
}

function sessionCookie(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toContain('mp_session=');
  return setCookie?.split(';')[0] ?? '';
}

async function seedUser(input: { id: string; username: string; password: string }) {
  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, default_currency, created_at, updated_at)
     VALUES (?, ?, ?, 'user', 'USD', ?, ?)`
  )
    .bind(input.id, input.username, await hashPassword(input.password), now, now)
    .run();
}

async function login() {
  const response = await app.request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'u1', password: 'user-secret' })
    },
    env
  );
  const body = (await response.json()) as { csrfToken: string };
  return { cookie: sessionCookie(response), csrfToken: body.csrfToken };
}

function formData(file: File) {
  const body = new FormData();
  body.set('receipt', file);
  return body;
}

async function tableCount(table: 'receipts' | 'receipt_items') {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return row?.count ?? 0;
}

describe('receipt extraction route', () => {
  beforeEach(async () => {
    aiRun = vi.fn();
    env = {
      ADMIN_BOOTSTRAP_PASSWORD: 'bootstrap-secret',
      APP_ENV: 'test',
      ASSETS: unusedBinding<Fetcher>('ASSETS'),
      AI: { run: aiRun } as unknown as Ai,
      DB: await createDb()
    };
  });

  afterEach(async () => {
    await miniflare?.dispose();
    miniflare = undefined;
  });

  it('returns 401 for unauthenticated uploads', async () => {
    const response = await app.request(
      '/api/extract-receipt',
      {
        method: 'POST',
        body: formData(new File([new Uint8Array([1, 2, 3])], 'receipt.png', { type: 'image/png' }))
      },
      env
    );

    expect(response.status).toBe(401);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('requires a valid CSRF token for authenticated uploads', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login();

    const response = await app.request(
      '/api/extract-receipt',
      {
        method: 'POST',
        headers: { cookie: user.cookie },
        body: formData(new File([new Uint8Array([1, 2, 3])], 'receipt.png', { type: 'image/png' }))
      },
      env
    );

    expect(response.status).toBe(403);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('returns 400 for non-image uploads', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login();

    const response = await app.request(
      '/api/extract-receipt',
      {
        method: 'POST',
        headers: { cookie: user.cookie, 'x-csrf-token': user.csrfToken },
        body: formData(new File(['merchant,total'], 'receipt.csv', { type: 'text/csv' }))
      },
      env
    );

    expect(response.status).toBe(400);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('returns 413 for oversized uploads', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login();

    const response = await app.request(
      '/api/extract-receipt',
      {
        method: 'POST',
        headers: { cookie: user.cookie, 'x-csrf-token': user.csrfToken },
        body: formData(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'receipt.png', { type: 'image/png' }))
      },
      env
    );

    expect(response.status).toBe(413);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('calls Workers AI for a valid image and returns a normalized editable draft without storing rows', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login();
    aiRun.mockResolvedValue({
      response: `\`\`\`json
{
  "merchant": "Corner Market",
  "purchaseDate": "2026-05-25",
  "currency": "usd",
  "subtotal": "$10.00",
  "tax": "0.83",
  "discount": "$1.00",
  "total": "$9.83",
  "categoryHint": "groceries",
  "notes": "milk and bread",
  "items": [
    { "name": "Milk", "quantity": "2", "unitPrice": "$3.50", "totalPrice": "$7.00", "categoryName": "Groceries" },
    { "name": "Bread", "quantity": 1, "unitPrice": "3.00", "totalPrice": "$3.00" }
  ]
}
\`\`\``
    });

    const response = await app.request(
      '/api/extract-receipt',
      {
        method: 'POST',
        headers: { cookie: user.cookie, 'x-csrf-token': user.csrfToken },
        body: formData(new File([new Uint8Array([137, 80, 78, 71])], 'receipt.png', { type: 'image/png' }))
      },
      env
    );

    expect(response.status).toBe(200);
    expect(aiRun).toHaveBeenCalledOnce();
    expect(aiRun.mock.calls[0][1]).toMatchObject({ image: expect.any(Array), mimeType: 'image/png' });
    await expect(response.json()).resolves.toEqual({
      draft: {
        merchant: 'Corner Market',
        purchaseDate: '2026-05-25',
        currency: 'USD',
        subtotal: 1000,
        tax: 83,
        discount: 100,
        total: 983,
        categoryName: null,
        categoryHint: 'groceries',
        notes: 'milk and bread',
        sourceType: 'receipt_image',
        items: [
          {
            name: 'Milk',
            quantity: 2,
            unitPrice: 350,
            totalPrice: 700,
            categoryName: 'Groceries',
            categoryHint: null
          },
          {
            name: 'Bread',
            quantity: 1,
            unitPrice: 300,
            totalPrice: 300,
            categoryName: null,
            categoryHint: null
          }
        ]
      }
    });
    expect(await tableCount('receipts')).toBe(0);
    expect(await tableCount('receipt_items')).toBe(0);
  });
});
