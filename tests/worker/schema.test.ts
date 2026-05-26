// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { Miniflare } from 'miniflare';
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

const now = '2026-05-26T00:00:00.000Z';
const migrationsPromise = readD1Migrations('migrations');
let miniflare: Miniflare | undefined;

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

async function expectDbError(action: Promise<unknown>) {
  await expect(action).rejects.toThrow();
}

async function seedUsers(db: D1Database) {
  await db
    .prepare(
      `INSERT INTO users (id, username, password_hash, role, default_currency, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 'USD', ?, ?), (?, ?, ?, 'user', 'USD', ?, ?)`
    )
    .bind('user_1', 'u1', 'hash_1', now, now, 'user_2', 'u2', 'hash_2', now, now)
    .run();
}

async function seedCustomCategories(db: D1Database) {
  await db
    .prepare(
      `INSERT INTO categories (id, user_id, name, kind, color, icon, created_at)
       VALUES (?, ?, ?, 'custom', '#111111', 'tag', ?), (?, ?, ?, 'custom', '#222222', 'tag', ?)`
    )
    .bind('cat_user_1', 'user_1', 'User 1 category', now, 'cat_user_2', 'user_2', 'User 2 category', now)
    .run();
}

describe('initial D1 migration', () => {
  afterEach(async () => {
    await miniflare?.dispose();
    miniflare = undefined;
  });

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

  it('seeds built-in categories with no user owner', async () => {
    const db = await createDb();

    const result = await db
      .prepare("SELECT name, user_id, kind FROM categories WHERE kind = 'built_in' ORDER BY name")
      .all<{ name: string; user_id: string | null; kind: string }>();

    expect(result.results).toEqual(
      expect.arrayContaining([
        { name: 'Groceries', user_id: null, kind: 'built_in' },
        { name: 'Household', user_id: null, kind: 'built_in' },
        { name: 'Online shopping', user_id: null, kind: 'built_in' }
      ])
    );
    expect(result.results).toHaveLength(11);
  });

  it('rejects malformed category ownership for built-in and custom rows', async () => {
    const db = await createDb();
    await seedUsers(db);

    await expectDbError(
      db
        .prepare(
          `INSERT INTO categories (id, user_id, name, kind, color, icon, created_at)
           VALUES ('cat_bad_builtin', 'user_1', 'Bad built in', 'built_in', '#000000', 'tag', ?)`
        )
        .bind(now)
        .run()
    );

    await expectDbError(
      db
        .prepare(
          `INSERT INTO categories (id, user_id, name, kind, color, icon, created_at)
           VALUES ('cat_bad_custom', NULL, 'Bad custom', 'custom', '#000000', 'tag', ?)`
        )
        .bind(now)
        .run()
    );
  });

  it('sets receipt and receipt item category references to null when a category is deleted', async () => {
    const db = await createDb();
    await seedUsers(db);
    await seedCustomCategories(db);

    await db
      .prepare(
        `INSERT INTO receipts (id, user_id, merchant, purchase_date, currency, subtotal, tax, discount, total, category_id, notes, source_type, created_at, updated_at)
         VALUES ('receipt_1', 'user_1', 'Store', '2026-05-01', 'USD', NULL, NULL, NULL, 1200, 'cat_user_1', NULL, 'manual', ?, ?)`
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO receipt_items (id, receipt_id, user_id, name, quantity, unit_price, total_price, category_id, created_at)
         VALUES ('item_1', 'receipt_1', 'user_1', 'Item', 1, 1200, 1200, 'cat_user_1', ?)`
      )
      .bind(now)
      .run();

    await db.prepare("DELETE FROM categories WHERE id = 'cat_user_1'").run();

    const receipt = await db.prepare("SELECT category_id FROM receipts WHERE id = 'receipt_1'").first<{
      category_id: string | null;
    }>();
    const item = await db.prepare("SELECT category_id FROM receipt_items WHERE id = 'item_1'").first<{
      category_id: string | null;
    }>();

    expect(receipt?.category_id).toBeNull();
    expect(item?.category_id).toBeNull();
  });

  it('deletes receipt items when their receipt is deleted', async () => {
    const db = await createDb();
    await seedUsers(db);

    await db
      .prepare(
        `INSERT INTO receipts (id, user_id, merchant, purchase_date, currency, subtotal, tax, discount, total, category_id, notes, source_type, created_at, updated_at)
         VALUES ('receipt_1', 'user_1', 'Store', '2026-05-01', 'USD', NULL, NULL, NULL, 1200, NULL, NULL, 'manual', ?, ?)`
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO receipt_items (id, receipt_id, user_id, name, quantity, unit_price, total_price, category_id, created_at)
         VALUES ('item_1', 'receipt_1', 'user_1', 'Item', 1, 1200, 1200, NULL, ?)`
      )
      .bind(now)
      .run();

    await db.prepare("DELETE FROM receipts WHERE id = 'receipt_1'").run();

    const count = await db.prepare('SELECT COUNT(*) AS count FROM receipt_items').first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it('rejects cross-user custom category use for receipts, receipt items, and budgets', async () => {
    const db = await createDb();
    await seedUsers(db);
    await seedCustomCategories(db);

    await expectDbError(
      db
        .prepare(
          `INSERT INTO receipts (id, user_id, merchant, purchase_date, currency, subtotal, tax, discount, total, category_id, notes, source_type, created_at, updated_at)
           VALUES ('receipt_bad', 'user_1', 'Store', '2026-05-01', 'USD', NULL, NULL, NULL, 1200, 'cat_user_2', NULL, 'manual', ?, ?)`
        )
        .bind(now, now)
        .run()
    );

    await db
      .prepare(
        `INSERT INTO receipts (id, user_id, merchant, purchase_date, currency, subtotal, tax, discount, total, category_id, notes, source_type, created_at, updated_at)
         VALUES ('receipt_1', 'user_1', 'Store', '2026-05-01', 'USD', NULL, NULL, NULL, 1200, NULL, NULL, 'manual', ?, ?)`
      )
      .bind(now, now)
      .run();

    await expectDbError(db.prepare("UPDATE receipts SET category_id = 'cat_user_2' WHERE id = 'receipt_1'").run());

    await expectDbError(
      db
        .prepare(
          `INSERT INTO receipt_items (id, receipt_id, user_id, name, quantity, unit_price, total_price, category_id, created_at)
           VALUES ('item_bad', 'receipt_1', 'user_1', 'Item', 1, 1200, 1200, 'cat_user_2', ?)`
        )
        .bind(now)
        .run()
    );

    await db
      .prepare(
        `INSERT INTO receipt_items (id, receipt_id, user_id, name, quantity, unit_price, total_price, category_id, created_at)
         VALUES ('item_1', 'receipt_1', 'user_1', 'Item', 1, 1200, 1200, NULL, ?)`
      )
      .bind(now)
      .run();

    await expectDbError(db.prepare("UPDATE receipt_items SET category_id = 'cat_user_2' WHERE id = 'item_1'").run());

    await expectDbError(
      db
        .prepare(
          `INSERT INTO budgets (id, user_id, category_id, month, currency, amount, created_at, updated_at)
           VALUES ('budget_bad', 'user_1', 'cat_user_2', '2026-05', 'USD', 5000, ?, ?)`
        )
        .bind(now, now)
        .run()
    );

    await db
      .prepare(
        `INSERT INTO budgets (id, user_id, category_id, month, currency, amount, created_at, updated_at)
         VALUES ('budget_1', 'user_1', 'cat_user_1', '2026-05', 'USD', 5000, ?, ?)`
      )
      .bind(now, now)
      .run();

    await expectDbError(db.prepare("UPDATE budgets SET category_id = 'cat_user_2' WHERE id = 'budget_1'").run());
  });
});
