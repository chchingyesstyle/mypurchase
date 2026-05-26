// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { Miniflare } from 'miniflare';
import type { AppEnv } from '../../src/worker/env';
import { app } from '../../src/worker/index';
import { hashPassword } from '../../src/worker/security/passwords';

const migrationsPromise = readD1Migrations('migrations');
const now = '2026-05-26T00:00:00.000Z';
let miniflare: Miniflare | undefined;
let env: AppEnv;

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

async function seedCategory(input: { id: string; userId: string; name: string }) {
  await env.DB.prepare(
    `INSERT INTO categories (id, user_id, name, kind, color, icon, created_at)
     VALUES (?, ?, ?, 'custom', '#111111', 'tag', ?)`
  )
    .bind(input.id, input.userId, input.name, now)
    .run();
}

async function login(username: string, password: string) {
  const response = await app.request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    },
    env
  );
  const body = (await response.json()) as { csrfToken: string };
  return { response, cookie: sessionCookie(response), csrfToken: body.csrfToken };
}

async function monthVersion(userId: string, month: string) {
  const row = await env.DB.prepare('SELECT records_version FROM user_month_versions WHERE user_id = ? AND month = ?')
    .bind(userId, month)
    .first<{ records_version: number }>();
  return row?.records_version ?? 0;
}

async function receiptItemCount(receiptId: string) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM receipt_items WHERE receipt_id = ?')
    .bind(receiptId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

function receiptPayload(overrides: Record<string, unknown> = {}) {
  return {
    merchant: 'Market Basket',
    purchaseDate: '2026-05-15',
    currency: 'USD',
    subtotal: 1098,
    tax: 77,
    discount: 100,
    total: 1075,
    categoryId: 'cat_builtin_groceries',
    notes: 'weekly shop',
    sourceType: 'manual',
    items: [
      {
        name: 'Apples',
        quantity: 2,
        unitPrice: 299,
        totalPrice: 598,
        categoryId: 'cat_builtin_groceries'
      },
      {
        name: 'Bread',
        quantity: 1,
        unitPrice: 500,
        totalPrice: 500,
        categoryId: 'cat_builtin_groceries'
      }
    ],
    ...overrides
  };
}

async function createReceipt(session: { cookie: string; csrfToken: string }, overrides: Record<string, unknown> = {}) {
  return app.request(
    '/api/receipts',
    {
      method: 'POST',
      headers: { cookie: session.cookie, 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
      body: JSON.stringify(receiptPayload(overrides))
    },
    env
  );
}

describe('receipt routes', () => {
  beforeEach(async () => {
    env = {
      ADMIN_BOOTSTRAP_PASSWORD: 'bootstrap-secret',
      APP_ENV: 'test',
      ASSETS: unusedBinding<Fetcher>('ASSETS'),
      AI: unusedBinding<Ai>('AI'),
      DB: await createDb()
    };
  });

  afterEach(async () => {
    await miniflare?.dispose();
    miniflare = undefined;
  });

  it('creates a receipt with two item lines and increments the purchase month version', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');

    const response = await createReceipt(user);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { receipt: { id: string; userId: string; items: Array<{ name: string }> } };
    expect(body.receipt).toMatchObject({
      userId: 'user_1',
      merchant: 'Market Basket',
      purchaseDate: '2026-05-15',
      total: 1075,
      categoryId: 'cat_builtin_groceries'
    });
    expect(body.receipt.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Apples', quantity: 2, totalPrice: 598 }),
      expect.objectContaining({ name: 'Bread', quantity: 1, totalPrice: 500 })
    ]));
    expect(await receiptItemCount(body.receipt.id)).toBe(2);
    expect(await monthVersion('user_1', '2026-05')).toBe(1);
  });

  it('lists only current user receipts and supports detail including items', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedUser({ id: 'user_2', username: 'u2', password: 'user-secret' });
    const user1 = await login('u1', 'user-secret');
    const user2 = await login('u2', 'user-secret');
    const user1Create = await createReceipt(user1);
    const user1Receipt = ((await user1Create.json()) as { receipt: { id: string } }).receipt;
    await createReceipt(user2, { merchant: 'Other Market', total: 450, subtotal: 450, tax: 0, discount: 0 });

    const listResponse = await app.request('/api/receipts?month=2026-05', { headers: { cookie: user1.cookie } }, env);
    const detailResponse = await app.request(`/api/receipts/${user1Receipt.id}`, { headers: { cookie: user1.cookie } }, env);

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as { receipts: Array<{ userId: string; merchant: string }> };
    expect(listBody.receipts).toEqual([expect.objectContaining({ userId: 'user_1', merchant: 'Market Basket' })]);
    expect(listBody.receipts).not.toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'user_2' })]));

    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      receipt: {
        id: user1Receipt.id,
        userId: 'user_1',
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Apples', quantity: 2, totalPrice: 598 }),
          expect.objectContaining({ name: 'Bread', quantity: 1, totalPrice: 500 })
        ])
      }
    });
  });
  it('bounds receipt listing with limit and offset and validates long text filters', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');

    await env.DB.batch(
      Array.from({ length: 55 }, (_, index) =>
        env.DB.prepare(
          "INSERT INTO receipts (id, user_id, merchant, purchase_date, currency, subtotal, tax, discount, total, category_id, notes, source_type, created_at, updated_at) VALUES (?, 'user_1', ?, ?, 'USD', NULL, NULL, NULL, 100, 'cat_builtin_groceries', NULL, 'manual', ?, ?)"
        ).bind(
          'receipt_' + index,
          'Market ' + String(index).padStart(2, '0'),
          '2026-05-' + String((index % 28) + 1).padStart(2, '0'),
          now,
          now
        )
      )
    );

    const defaultResponse = await app.request('/api/receipts?month=2026-05', { headers: { cookie: user.cookie } }, env);
    const boundedResponse = await app.request('/api/receipts?month=2026-05&limit=100&offset=50', {
      headers: { cookie: user.cookie }
    }, env);
    const tooLargeLimitResponse = await app.request('/api/receipts?limit=101', { headers: { cookie: user.cookie } }, env);
    const longMerchantResponse = await app.request('/api/receipts?merchant=' + 'x'.repeat(101), {
      headers: { cookie: user.cookie }
    }, env);
    const longQResponse = await app.request('/api/receipts?q=' + 'x'.repeat(101), { headers: { cookie: user.cookie } }, env);

    expect(defaultResponse.status).toBe(200);
    const defaultBody = (await defaultResponse.json()) as { receipts: unknown[] };
    expect(defaultBody.receipts).toHaveLength(50);

    expect(boundedResponse.status).toBe(200);
    const boundedBody = (await boundedResponse.json()) as { receipts: unknown[] };
    expect(boundedBody.receipts).toHaveLength(5);

    expect(tooLargeLimitResponse.status).toBe(400);
    expect(longMerchantResponse.status).toBe(400);
    expect(longQResponse.status).toBe(400);
  });

  it('updates a receipt, replaces item lines, and increments affected month versions when moved', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');
    const createResponse = await createReceipt(user);
    const receipt = ((await createResponse.json()) as { receipt: { id: string } }).receipt;

    const updateResponse = await app.request(
      `/api/receipts/${receipt.id}`,
      {
        method: 'PUT',
        headers: { cookie: user.cookie, 'content-type': 'application/json', 'x-csrf-token': user.csrfToken },
        body: JSON.stringify(
          receiptPayload({
            merchant: 'June Market',
            purchaseDate: '2026-06-01',
            subtotal: 2500,
            tax: 0,
            discount: 0,
            total: 2500,
            items: [
              { name: 'Coffee', quantity: 1, unitPrice: 2500, totalPrice: 2500, categoryId: 'cat_builtin_groceries' }
            ]
          })
        )
      },
      env
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      receipt: {
        id: receipt.id,
        merchant: 'June Market',
        purchaseDate: '2026-06-01',
        items: [{ name: 'Coffee', quantity: 1, totalPrice: 2500 }]
      }
    });
    expect(await receiptItemCount(receipt.id)).toBe(1);
    expect(await monthVersion('user_1', '2026-05')).toBe(2);
    expect(await monthVersion('user_1', '2026-06')).toBe(1);
  });

  it('deletes a receipt and its item lines while incrementing the purchase month version', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');
    const createResponse = await createReceipt(user);
    const receipt = ((await createResponse.json()) as { receipt: { id: string } }).receipt;

    const deleteResponse = await app.request(`/api/receipts/${receipt.id}`, {
      method: 'DELETE',
      headers: { cookie: user.cookie, 'x-csrf-token': user.csrfToken }
    }, env);

    expect(deleteResponse.status).toBe(200);
    expect(await receiptItemCount(receipt.id)).toBe(0);
    const row = await env.DB.prepare('SELECT id FROM receipts WHERE id = ?').bind(receipt.id).first<{ id: string }>();
    expect(row).toBeNull();
    expect(await monthVersion('user_1', '2026-05')).toBe(2);
  });

  it('returns 404 for cross-user detail, update, and delete access', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedUser({ id: 'user_2', username: 'u2', password: 'user-secret' });
    const owner = await login('u1', 'user-secret');
    const other = await login('u2', 'user-secret');
    const createResponse = await createReceipt(owner);
    const receipt = ((await createResponse.json()) as { receipt: { id: string } }).receipt;

    const detailResponse = await app.request(`/api/receipts/${receipt.id}`, { headers: { cookie: other.cookie } }, env);
    const updateResponse = await app.request(
      `/api/receipts/${receipt.id}`,
      {
        method: 'PUT',
        headers: { cookie: other.cookie, 'content-type': 'application/json', 'x-csrf-token': other.csrfToken },
        body: JSON.stringify(receiptPayload({ merchant: 'Stolen' }))
      },
      env
    );
    const deleteResponse = await app.request(`/api/receipts/${receipt.id}`, {
      method: 'DELETE',
      headers: { cookie: other.cookie, 'x-csrf-token': other.csrfToken }
    }, env);

    expect(detailResponse.status).toBe(404);
    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    const ownerDetail = await app.request(`/api/receipts/${receipt.id}`, { headers: { cookie: owner.cookie } }, env);
    await expect(ownerDetail.json()).resolves.toMatchObject({ receipt: { merchant: 'Market Basket' } });
  });

  it('returns controlled 404 for hidden categories on create and update', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedUser({ id: 'user_2', username: 'u2', password: 'user-secret' });
    await seedCategory({ id: 'cat_user_2', userId: 'user_2', name: 'User 2 custom' });
    const user = await login('u1', 'user-secret');
    const createResponse = await createReceipt(user);
    const receipt = ((await createResponse.json()) as { receipt: { id: string } }).receipt;

    const hiddenCreate = await createReceipt(user, { categoryId: 'cat_user_2' });
    const hiddenUpdate = await app.request(
      `/api/receipts/${receipt.id}`,
      {
        method: 'PUT',
        headers: { cookie: user.cookie, 'content-type': 'application/json', 'x-csrf-token': user.csrfToken },
        body: JSON.stringify(receiptPayload({ categoryId: 'cat_user_2' }))
      },
      env
    );

    expect(hiddenCreate.status).toBe(404);
    expect(hiddenUpdate.status).toBe(404);
  });

  it('validates receipt currency, date, money, quantity, and source type', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');

    for (const invalid of [
      { currency: 'usd' },
      { purchaseDate: '2026-02-31' },
      { total: -1 },
      { items: [{ name: 'Bad', quantity: 0, unitPrice: 100, totalPrice: 100 }] },
      { sourceType: 'scan' }
    ]) {
      const response = await createReceipt(user, invalid);
      expect(response.status).toBe(400);
    }
  });
});
