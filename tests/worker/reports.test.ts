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

async function login(username: string) {
  const response = await app.request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'user-secret' })
    },
    env
  );
  const body = (await response.json()) as { csrfToken: string };
  return { cookie: sessionCookie(response), csrfToken: body.csrfToken };
}

function receiptPayload(overrides: Record<string, unknown> = {}) {
  return {
    merchant: 'Market Basket',
    purchaseDate: '2026-05-15',
    currency: 'USD',
    subtotal: 1800,
    tax: 0,
    discount: 0,
    total: 1800,
    categoryId: 'cat_builtin_groceries',
    notes: null,
    sourceType: 'manual',
    items: [
      { name: 'Milk, 1 Gal.', quantity: 1, unitPrice: 500, totalPrice: 500, categoryId: 'cat_builtin_groceries' },
      { name: 'Coffee Beans', quantity: 1, unitPrice: 1300, totalPrice: 1300, categoryId: 'cat_builtin_groceries' }
    ],
    ...overrides
  };
}

async function createReceipt(session: { cookie: string; csrfToken: string }, overrides: Record<string, unknown> = {}) {
  const response = await app.request(
    '/api/receipts',
    {
      method: 'POST',
      headers: { cookie: session.cookie, 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
      body: JSON.stringify(receiptPayload(overrides))
    },
    env
  );
  expect(response.status).toBe(201);
  return response;
}

async function putBudget(session: { cookie: string; csrfToken: string }, categoryId: string, amount: number) {
  const response = await app.request(
    `/api/budgets/${categoryId}/2026-05`,
    {
      method: 'PUT',
      headers: { cookie: session.cookie, 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
      body: JSON.stringify({ amount, currency: 'USD' })
    },
    env
  );
  expect(response.status).toBe(200);
}

async function generateReport(session: { cookie: string; csrfToken: string }, month = '2026-05') {
  return app.request(
    `/api/reports/${month}/generate`,
    {
      method: 'POST',
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrfToken }
    },
    env
  );
}

describe('monthly report routes', () => {
  beforeEach(async () => {
    aiRun = vi.fn().mockResolvedValue({
      overview: 'Spending was grocery heavy.',
      savingOpportunities: ['Compare coffee prices.'],
      budgetWarnings: ['Groceries are close to budget.'],
      recurringNotes: ['Milk appears repeatedly.'],
      itemInsights: ['Coffee is the highest item total.'],
      nextMonthSuggestions: ['Set a coffee limit.']
    });
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

  it('summarizes monthly totals by category, merchant, item, recurring item, budget, and previous month', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');
    await createReceipt(user);
    await createReceipt(user, {
      merchant: 'Market Basket',
      purchaseDate: '2026-05-22',
      subtotal: 900,
      total: 900,
      items: [{ name: ' milk 1 gal ', quantity: 1, unitPrice: 900, totalPrice: 900, categoryId: 'cat_builtin_groceries' }]
    });
    await createReceipt(user, {
      merchant: 'Burger Shop',
      categoryId: 'cat_builtin_dining',
      subtotal: 2500,
      total: 2500,
      items: [{ name: 'Lunch', quantity: 1, unitPrice: 2500, totalPrice: 2500, categoryId: 'cat_builtin_dining' }]
    });
    await createReceipt(user, {
      merchant: 'Old Burger Shop',
      purchaseDate: '2026-04-10',
      categoryId: 'cat_builtin_dining',
      subtotal: 1000,
      total: 1000,
      items: [{ name: 'Lunch', quantity: 1, unitPrice: 1000, totalPrice: 1000, categoryId: 'cat_builtin_dining' }]
    });
    await putBudget(user, 'cat_builtin_groceries', 3000);

    const response = await generateReport(user);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { report: any };
    expect(body.report).toMatchObject({ userId: 'user_1', month: '2026-05', aiStatus: 'ready' });
    expect(body.report.summary.totals).toMatchObject({ total: 5200, receiptCount: 3, itemCount: 4 });
    expect(body.report.summary.categoryTotals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: 'cat_builtin_groceries', total: 2700, receiptCount: 2 }),
        expect.objectContaining({ categoryId: 'cat_builtin_dining', total: 2500, receiptCount: 1 })
      ])
    );
    expect(body.report.summary.merchantTotals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ merchant: 'Market Basket', total: 2700, receiptCount: 2 }),
        expect.objectContaining({ merchant: 'Burger Shop', total: 2500, receiptCount: 1 })
      ])
    );
    expect(body.report.summary.itemTotals).toEqual(
      expect.arrayContaining([expect.objectContaining({ normalizedName: 'milk 1 gal', total: 1400, count: 2 })])
    );
    expect(body.report.summary.recurringItemCandidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ normalizedName: 'milk 1 gal', count: 2, total: 1400 })])
    );
    expect(body.report.summary.budgetStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: 'cat_builtin_groceries', amount: 3000, spent: 2700, remaining: 300, percentUsed: 90 })
      ])
    );
    expect(body.report.summary.previousMonthComparisons).toMatchObject({
      month: '2026-04',
      total: 1000,
      delta: 4200
    });
    expect(body.report.summary.unusualIncreases).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'category', categoryId: 'cat_builtin_dining' })])
    );
  });

  it('reuses a cached report while the month records version is current', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');
    await createReceipt(user);
    await expect(generateReport(user)).resolves.toHaveProperty('status', 200);
    aiRun.mockClear();

    const response = await app.request('/api/reports/2026-05', { headers: { cookie: user.cookie } }, env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { report: { month: string; aiStatus: string } };
    expect(body.report).toMatchObject({ month: '2026-05', aiStatus: 'ready' });
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('regenerates AI advice when the month records version changes', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');
    await createReceipt(user);
    await generateReport(user);
    aiRun.mockResolvedValueOnce({ response: '{"overview":"Version two","savingOpportunities":[]}' });

    await createReceipt(user, { merchant: 'New Market', subtotal: 100, total: 100, items: [] });
    const response = await generateReport(user);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { report: { advice: { overview: string }; recordsVersion: number } };
    expect(aiRun).toHaveBeenCalledTimes(2);
    expect(body.report.recordsVersion).toBe(2);
    expect(body.report.advice.overview).toBe('Version two');
  });

  it('does not let users read another user report through cache lookup', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedUser({ id: 'user_2', username: 'u2', password: 'user-secret' });
    const user1 = await login('u1');
    const user2 = await login('u2');
    await createReceipt(user1, { merchant: 'Private Market' });
    await generateReport(user1);

    const response = await app.request('/api/reports/2026-05', { headers: { cookie: user2.cookie } }, env);

    expect(response.status).toBe(404);
  });

  it('requires CSRF for report generation', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');

    const response = await app.request('/api/reports/2026-05/generate', { method: 'POST', headers: { cookie: user.cookie } }, env);

    expect(response.status).toBe(403);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('returns deterministic summary when AI fails and does not replace cached advice', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');
    await createReceipt(user);
    await generateReport(user);
    await createReceipt(user, { merchant: 'New Market', subtotal: 100, total: 100, items: [] });
    aiRun.mockRejectedValueOnce(new Error('AI unavailable'));

    const response = await generateReport(user);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { report: { aiStatus: string; summary: { totals: { total: number } } } };
    expect(body.report.aiStatus).toBe('failed');
    expect(body.report.summary.totals.total).toBe(1900);

    const cachedResponse = await app.request('/api/reports/2026-05', { headers: { cookie: user.cookie } }, env);
    expect(cachedResponse.status).toBe(404);
  });

  it('builds and prompts reports using only the authenticated user data', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    await seedUser({ id: 'user_2', username: 'u2', password: 'user-secret' });
    const user1 = await login('u1');
    const user2 = await login('u2');
    await createReceipt(user1, { merchant: 'Allowed Market', total: 1200, subtotal: 1200 });
    await createReceipt(user2, { merchant: 'Other User Jewelers', total: 999999, subtotal: 999999 });

    const response = await generateReport(user1);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { report: { summary: { totals: { total: number }; merchantTotals: Array<{ merchant: string }> } } };
    expect(body.report.summary.totals.total).toBe(1200);
    expect(body.report.summary.merchantTotals).toEqual([expect.objectContaining({ merchant: 'Allowed Market' })]);
    expect(JSON.stringify(aiRun.mock.calls)).toContain('Allowed Market');
    expect(JSON.stringify(aiRun.mock.calls)).not.toContain('Other User Jewelers');
    expect(JSON.stringify(aiRun.mock.calls)).not.toContain('999999');
  });



  it('uses the requested month for previous-month comparisons when current month is empty', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');
    await createReceipt(user, {
      merchant: 'April Market',
      purchaseDate: '2026-04-10',
      subtotal: 700,
      total: 700,
      items: [{ name: 'April Item', quantity: 1, unitPrice: 700, totalPrice: 700, categoryId: 'cat_builtin_groceries' }]
    });

    const response = await generateReport(user, '2026-05');

    expect(response.status).toBe(200);
    const body = (await response.json()) as { report: { summary: { totals: { total: number }; previousMonthComparisons: { month: string; total: number; delta: number } } } };
    expect(body.report.summary.totals.total).toBe(0);
    expect(body.report.summary.previousMonthComparisons).toMatchObject({ month: '2026-04', total: 700, delta: -700 });
  });

  it('treats malformed AI report advice as failed and does not save cache', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');
    await createReceipt(user);
    aiRun.mockResolvedValueOnce({ response: 'not json' });

    const response = await generateReport(user);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { report: { aiStatus: string } };
    expect(body.report.aiStatus).toBe('failed');
    const cachedResponse = await app.request('/api/reports/2026-05', { headers: { cookie: user.cookie } }, env);
    expect(cachedResponse.status).toBe(404);
  });

  it('treats corrupt cached report JSON as a cache miss', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');
    await createReceipt(user);
    await env.DB.prepare(
      `INSERT INTO monthly_reports (id, user_id, month, summary_json, ai_advice_json, records_version, created_at, updated_at)
       VALUES ('report_bad', 'user_1', '2026-05', '{bad', '{}', 1, ?, ?)`
    )
      .bind(now, now)
      .run();

    const response = await app.request('/api/reports/2026-05', { headers: { cookie: user.cookie } }, env);

    expect(response.status).toBe(404);
  });

  it('validates report month parameters', async () => {
    await seedUser({ id: 'user_1', username: 'u1', password: 'user-secret' });
    const user = await login('u1');

    const response = await app.request('/api/reports/2026-13/generate', {
      method: 'POST',
      headers: { cookie: user.cookie, 'x-csrf-token': user.csrfToken }
    }, env);

    expect(response.status).toBe(400);
    expect(aiRun).not.toHaveBeenCalled();
  });
});
