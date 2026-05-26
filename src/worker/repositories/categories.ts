import type { Category } from '../../shared/types';
import { rowToCamel } from './db';

export async function listVisibleCategories(db: D1Database, userId: string): Promise<Category[]> {
  const result = await db
    .prepare('SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY user_id IS NOT NULL, name')
    .bind(userId)
    .all<Record<string, unknown>>();
  return result.results.map((row) => rowToCamel(row) as Category);
}
