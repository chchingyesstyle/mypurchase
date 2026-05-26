import type { Category } from '../../shared/types';
import { newId, nowIso, rowToCamel } from './db';

export async function listVisibleCategories(db: D1Database, userId: string): Promise<Category[]> {
  const result = await db
    .prepare('SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY user_id IS NOT NULL, name')
    .bind(userId)
    .all<Record<string, unknown>>();
  return result.results.map((row) => rowToCamel(row) as Category);
}

export async function findVisibleCategory(db: D1Database, userId: string, categoryId: string): Promise<Category | null> {
  const row = await db
    .prepare('SELECT * FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)')
    .bind(categoryId, userId)
    .first<Record<string, unknown>>();
  return row ? (rowToCamel(row) as Category) : null;
}

export async function createCustomCategory(
  db: D1Database,
  input: {
    userId: string;
    name: string;
    color: string;
    icon: string;
  }
): Promise<Category> {
  const id = newId('cat');
  const createdAt = nowIso();
  await db
    .prepare(
      `INSERT INTO categories (id, user_id, name, kind, color, icon, created_at)
       VALUES (?, ?, ?, 'custom', ?, ?, ?)`
    )
    .bind(id, input.userId, input.name, input.color, input.icon, createdAt)
    .run();

  const category = await findVisibleCategory(db, input.userId, id);
  if (!category) throw new Error('Failed to create category');
  return category;
}

export async function updateOwnedCustomCategory(
  db: D1Database,
  userId: string,
  categoryId: string,
  input: {
    name?: string;
    color?: string;
    icon?: string;
  }
): Promise<Category | null> {
  const existing = await db
    .prepare("SELECT * FROM categories WHERE id = ? AND user_id = ? AND kind = 'custom'")
    .bind(categoryId, userId)
    .first<Record<string, unknown>>();
  if (!existing) return null;

  const current = rowToCamel(existing) as Category;
  await db
    .prepare(
      `UPDATE categories
       SET name = ?, color = ?, icon = ?
       WHERE id = ? AND user_id = ? AND kind = 'custom'`
    )
    .bind(input.name ?? current.name, input.color ?? current.color, input.icon ?? current.icon, categoryId, userId)
    .run();

  return findVisibleCategory(db, userId, categoryId);
}

export async function deleteOwnedCustomCategory(db: D1Database, userId: string, categoryId: string) {
  const existing = await db
    .prepare("SELECT id FROM categories WHERE id = ? AND user_id = ? AND kind = 'custom'")
    .bind(categoryId, userId)
    .first<{ id: string }>();
  if (!existing) return false;

  await db
    .prepare("DELETE FROM categories WHERE id = ? AND user_id = ? AND kind = 'custom'")
    .bind(categoryId, userId)
    .run();
  return true;
}
