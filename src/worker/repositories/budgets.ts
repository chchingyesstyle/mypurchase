import { findVisibleCategory } from './categories';
import { newId, nowIso, rowToCamel } from './db';

export type Budget = {
  id: string;
  userId: string;
  categoryId: string;
  month: string;
  currency: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};

type BudgetRow = {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  currency: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

function rowToBudget(row: BudgetRow) {
  return rowToCamel(row) as Budget;
}

async function findBudget(db: D1Database, userId: string, id: string) {
  const row = await db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').bind(id, userId).first<BudgetRow>();
  return row ? rowToBudget(row) : null;
}

export async function listBudgetsByMonth(db: D1Database, userId: string, month: string) {
  const result = await db
    .prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ? ORDER BY category_id')
    .bind(userId, month)
    .all<BudgetRow>();
  return result.results.map(rowToBudget);
}

export async function upsertBudget(
  db: D1Database,
  input: {
    userId: string;
    categoryId: string;
    month: string;
    currency: string;
    amount: number;
  }
) {
  const category = await findVisibleCategory(db, input.userId, input.categoryId);
  if (!category) return null;

  const existing = await db
    .prepare('SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = ? LIMIT 1')
    .bind(input.userId, input.categoryId, input.month)
    .first<{ id: string }>();
  const now = nowIso();

  if (existing) {
    await db
      .prepare('UPDATE budgets SET currency = ?, amount = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(input.currency, input.amount, now, existing.id, input.userId)
      .run();
    return findBudget(db, input.userId, existing.id);
  }

  const id = newId('budget');
  await db
    .prepare(
      `INSERT INTO budgets (id, user_id, category_id, month, currency, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.userId, input.categoryId, input.month, input.currency, input.amount, now, now)
    .run();
  return findBudget(db, input.userId, id);
}

export async function deleteBudget(db: D1Database, userId: string, categoryId: string, month: string) {
  const category = await findVisibleCategory(db, userId, categoryId);
  if (!category) return null;

  const existing = await db
    .prepare('SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = ? LIMIT 1')
    .bind(userId, categoryId, month)
    .first<{ id: string }>();
  if (!existing) return false;

  await db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').bind(existing.id, userId).run();
  return true;
}
