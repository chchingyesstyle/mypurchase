// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { Miniflare } from 'miniflare';
import type { AppEnv } from '../../src/worker/env';
import { app } from '../../src/worker/index';
import { hashPassword, verifyPassword } from '../../src/worker/security/passwords';

const migrationsPromise = readD1Migrations('migrations');
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

async function login(password = 'bootstrap-secret') {
  return app.request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password })
    },
    env
  );
}

async function seedUser(input: { username: string; passwordHash: string; role: 'admin' | 'user' }) {
  const now = '2026-05-26T00:00:00.000Z';
  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, role, default_currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'USD', ?, ?)`
  )
    .bind(`user_${input.username}`, input.username, input.passwordHash, input.role, now, now)
    .run();
}

describe('auth routes', () => {
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

  it('creates a bootstrap admin when admin credentials match the bootstrap password', async () => {
    const response = await login();

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('mp_session=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Strict');
    await expect(response.json()).resolves.toMatchObject({
      user: { username: 'admin', role: 'admin', defaultCurrency: 'USD' },
      csrfToken: expect.any(String)
    });

    const adminCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").first<{
      count: number;
    }>();
    expect(adminCount?.count).toBe(1);
  });

  it('returns 401 for the wrong password', async () => {
    const response = await login('wrong-password');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid credentials' });
  });

  it('returns the current user when a session cookie is present', async () => {
    const loginResponse = await login();
    const cookie = sessionCookie(loginResponse);

    const response = await app.request('/api/auth/me', { headers: { cookie } }, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { username: 'admin', role: 'admin' },
      csrfToken: expect.any(String)
    });
  });

  it('clears the session cookie on logout', async () => {
    const loginResponse = await login();
    const cookie = sessionCookie(loginResponse);
    const { csrfToken } = (await loginResponse.json()) as { csrfToken: string };

    const response = await app.request(
      '/api/auth/logout',
      {
        method: 'POST',
        headers: { cookie, 'x-csrf-token': csrfToken }
      },
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('mp_session=;');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('returns a controlled error when admin username exists without an admin role during bootstrap', async () => {
    await seedUser({
      username: 'admin',
      passwordHash: await hashPassword('bootstrap-secret'),
      role: 'user'
    });

    const response = await login();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'admin_username_reserved', message: 'Admin username is reserved for bootstrap' }
    });
  });

  it('returns JSON 401 when changing password without authentication', async () => {
    const response = await app.request(
      '/api/auth/password',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'bootstrap-secret', newPassword: 'changed-secret' })
      },
      env
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'unauthorized', message: 'Authentication required' }
    });
  });

  it('returns JSON 403 when changing password without a valid CSRF token', async () => {
    const loginResponse = await login();
    const cookie = sessionCookie(loginResponse);

    const response = await app.request(
      '/api/auth/password',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'bootstrap-secret', newPassword: 'changed-secret' })
      },
      env
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'forbidden', message: 'Invalid CSRF token' }
    });
  });
});

describe('password hashes', () => {
  it('uses a versioned PBKDF2 format and verifies generated hashes', async () => {
    const hash = await hashPassword('bootstrap-secret');

    expect(hash).toMatch(/^v1\$pbkdf2_sha256\$100000\$/);
    await expect(verifyPassword('bootstrap-secret', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    await expect(verifyPassword('bootstrap-secret', 'v1$pbkdf2_sha256$100000$not-base64$%%%')).resolves.toBe(
      false
    );
    await expect(verifyPassword('bootstrap-secret', 'v1$pbkdf2_sha256$100000$missing-hash')).resolves.toBe(false);
    await expect(verifyPassword('bootstrap-secret', 'v2$pbkdf2_sha256$100000$salt$hash')).resolves.toBe(false);
  });

  it('returns false for invalid or out-of-range iterations', async () => {
    const hash = await hashPassword('bootstrap-secret');

    await expect(verifyPassword('bootstrap-secret', hash.replace('$100000$', '$99999$'))).resolves.toBe(false);
    await expect(verifyPassword('bootstrap-secret', hash.replace('$100000$', '$600001$'))).resolves.toBe(false);
    await expect(verifyPassword('bootstrap-secret', hash.replace('$100000$', '$not-a-number$'))).resolves.toBe(
      false
    );
  });
});
