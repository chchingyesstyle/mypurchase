import { findVisibleCategory } from './categories';
import { newId, nowIso, rowToCamel } from './db';
import { incrementUserMonthVersion } from './monthVersions';

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

async function findBudgetByKey(db: D1Database, userId: string, categoryId: string, month: string) {
  const row = await db
    .prepare('SELECT * FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?')
    .bind(userId, categoryId, month)
    .first<BudgetRow>();
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

  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO budgets (id, user_id, category_id, month, currency, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, category_id, month) DO UPDATE SET
         currency = excluded.currency,
         amount = excluded.amount,
         updated_at = excluded.updated_at`
    )
    .bind(newId('budget'), input.userId, input.categoryId, input.month, input.currency, input.amount, now, now)
    .run();

  await incrementUserMonthVersion(db, input.userId, input.month);
  return findBudgetByKey(db, input.userId, input.categoryId, input.month);
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
  await incrementUserMonthVersion(db, userId, month);
  return true;
}
