// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { Miniflare } from 'miniflare';
import type { AppEnv } from '../../src/worker/env';
import { app } from '../../src/worker/index';
import { hashPassword, verifyPassword } from '../../src/worker/security/passwords';

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

async function seedUser(input: { id: string; username: string; password: string; role?: 'admin' | 'user' }) {
  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, default_currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'USD', ?, ?)`
  )
    .bind(input.id, input.username, await hashPassword(input.password), input.role ?? 'user', now, now)
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

async function monthVersion(userId: string, month: string) {
  const row = await env.DB.prepare('SELECT records_version FROM user_month_versions WHERE user_id = ? AND month = ?')
    .bind(userId, month)
    .first<{ records_version: number }>();
  return row?.records_version ?? 0;
}

async function budgetCount(userId: string, categoryId: string, month: string) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?'
  )
    .bind(userId, categoryId, month)
    .first<{ count: number }>();
  return row?.count ?? 0;
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

describe('users, categories, and budgets routes', () => {
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

  it('allows admins to create users with hashed passwords', async () => {
    const admin = await login('admin', 'bootstrap-secret');

    const response = await app.request(
      '/api/users',
      {
        method: 'POST',
        headers: { cookie: admin.cookie, 'content-type': 'application/json', 'x-csrf-token': admin.csrfToken },
        body: JSON.stringify({ username: 'member', password: 'member-secret', role: 'user', defaultCurrency: 'EUR' })
      },
      env
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      user: { username: 'member', role: 'user', defaultCurrency: 'EUR' }
    });

    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE username = ?')
      .bind('member')
      .first<{ password_hash: string }>();
    expect(row?.password_hash).not.toBe('member-secret');
    await expect(verifyPassword('member-secret', row?.password_hash ?? '')).resolves.toBe(true);
  });

  it('rejects user creation from non-admin users', async () => {
    await seedUser({ id: 'user_member', username: 'member', password: 'member-secret' });
    const member = await login('member', 'member-secret');

    const response = await app.request(
      '/api/users',
      {
        method: 'POST',
        headers: { cookie: member.cookie, 'content-type': 'application/json', 'x-csrf-token': member.csrfToken },
        body: JSON.stringify({ username: 'other', password: 'other-secret', role: 'user', defaultCurrency: 'USD' })
      },
      env
    );

    expect(response.status).toBe(403);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE username = 'other'").first<{
      count: number;
    }>();
    expect(count?.count).toBe(0);
  });

  it('shows users built-in categories and only their own custom categories', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedUser({ id: 'user_2', username: 'u2', password: 'user-secret' });
    await seedCategory({ id: 'cat_user_1', userId: 'user_1', name: 'User 1 custom' });
    await seedCategory({ id: 'cat_user_2', userId: 'user_2', name: 'User 2 custom' });
    const user = await login('u1', 'user-secret');

    const response = await app.request('/api/categories', { headers: { cookie: user.cookie } }, env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { categories: Array<{ id: string; name: string; userId: string | null }> };
    expect(body.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'cat_builtin_groceries', userId: null }),
        expect.objectContaining({ id: 'cat_user_1', name: 'User 1 custom', userId: 'user_1' })
      ])
    );
    expect(body.categories).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'cat_user_2' })]));
  });

  it('does not allow users to edit another user custom category', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedUser({ id: 'user_2', username: 'u2', password: 'user-secret' });
    await seedCategory({ id: 'cat_user_2', userId: 'user_2', name: 'User 2 custom' });
    const user = await login('u1', 'user-secret');

    const response = await app.request(
      '/api/categories/cat_user_2',
      {
        method: 'PATCH',
        headers: { cookie: user.cookie, 'content-type': 'application/json', 'x-csrf-token': user.csrfToken },
        body: JSON.stringify({ name: 'Stolen category' })
      },
      env
    );

    expect(response.status).toBe(404);
    const category = await env.DB.prepare('SELECT name FROM categories WHERE id = ?')
      .bind('cat_user_2')
      .first<{ name: string }>();
    expect(category?.name).toBe('User 2 custom');
  });

  it('scopes budgets by user_id', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedUser({ id: 'user_2', username: 'u2', password: 'user-secret' });
    const user1 = await login('u1', 'user-secret');
    const user2 = await login('u2', 'user-secret');

    for (const [session, amount] of [
      [user1, 10000],
      [user2, 25000]
    ] as const) {
      const response = await app.request(
        '/api/budgets/cat_builtin_groceries/2026-05',
        {
          method: 'PUT',
          headers: { cookie: session.cookie, 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
          body: JSON.stringify({ amount, currency: 'USD' })
        },
        env
      );
      expect(response.status).toBe(200);
    }

    const response = await app.request('/api/budgets?month=2026-05', { headers: { cookie: user1.cookie } }, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      budgets: [{ userId: 'user_1', categoryId: 'cat_builtin_groceries', month: '2026-05', amount: 10000 }]
    });
  });


  it('updates an existing budget on repeated PUT for the same user, category, and month', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');

    for (const amount of [10000, 12500]) {
      const response = await app.request(
        '/api/budgets/cat_builtin_groceries/2026-05',
        {
          method: 'PUT',
          headers: { cookie: user.cookie, 'content-type': 'application/json', 'x-csrf-token': user.csrfToken },
          body: JSON.stringify({ amount, currency: 'USD' })
        },
        env
      );
      expect(response.status).toBe(200);
    }

    expect(await budgetCount('user_1', 'cat_builtin_groceries', '2026-05')).toBe(1);
    const budget = await env.DB.prepare(
      'SELECT amount FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?'
    )
      .bind('user_1', 'cat_builtin_groceries', '2026-05')
      .first<{ amount: number }>();
    expect(budget?.amount).toBe(12500);
  });

  it('increments month version when putting and deleting budgets', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');

    const putResponse = await app.request(
      '/api/budgets/cat_builtin_groceries/2026-05',
      {
        method: 'PUT',
        headers: { cookie: user.cookie, 'content-type': 'application/json', 'x-csrf-token': user.csrfToken },
        body: JSON.stringify({ amount: 10000, currency: 'USD' })
      },
      env
    );
    expect(putResponse.status).toBe(200);
    expect(await monthVersion('user_1', '2026-05')).toBe(1);

    const deleteResponse = await app.request(
      '/api/budgets/cat_builtin_groceries/2026-05',
      {
        method: 'DELETE',
        headers: { cookie: user.cookie, 'x-csrf-token': user.csrfToken }
      },
      env
    );
    expect(deleteResponse.status).toBe(200);
    expect(await monthVersion('user_1', '2026-05')).toBe(2);
  });

  it('increments affected month versions when deleting a custom category with budgets', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedCategory({ id: 'cat_user_1', userId: 'user_1', name: 'User 1 custom' });
    const user = await login('u1', 'user-secret');

    const putResponse = await app.request(
      '/api/budgets/cat_user_1/2026-05',
      {
        method: 'PUT',
        headers: { cookie: user.cookie, 'content-type': 'application/json', 'x-csrf-token': user.csrfToken },
        body: JSON.stringify({ amount: 10000, currency: 'USD' })
      },
      env
    );
    expect(putResponse.status).toBe(200);

    const deleteResponse = await app.request(
      '/api/categories/cat_user_1',
      {
        method: 'DELETE',
        headers: { cookie: user.cookie, 'x-csrf-token': user.csrfToken }
      },
      env
    );

    expect(deleteResponse.status).toBe(200);
    expect(await budgetCount('user_1', 'cat_user_1', '2026-05')).toBe(0);
    expect(await monthVersion('user_1', '2026-05')).toBe(2);
  });

  it('returns 404 when deleting a missing budget for a visible category', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');

    const response = await app.request(
      '/api/budgets/cat_builtin_groceries/2026-05',
      {
        method: 'DELETE',
        headers: { cookie: user.cookie, 'x-csrf-token': user.csrfToken }
      },
      env
    );

    expect(response.status).toBe(404);
  });

  it('requires budget months to match YYYY-MM', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1', 'user-secret');

    const response = await app.request(
      '/api/budgets/cat_builtin_groceries/2026-5',
      {
        method: 'PUT',
        headers: { cookie: user.cookie, 'content-type': 'application/json', 'x-csrf-token': user.csrfToken },
        body: JSON.stringify({ amount: 10000, currency: 'USD' })
      },
      env
    );

    expect(response.status).toBe(400);
  });
});
