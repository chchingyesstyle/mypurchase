import type { ReportAdvice } from '../ai/generateReportAdvice';
import type { MonthlySummary } from '../reports/summary';
import { newId, nowIso, rowToCamel } from './db';
import type { Budget } from './budgets';
import type { Receipt, ReceiptItem } from './receipts';

type ReceiptRow = {
  id: string;
  user_id: string;
  merchant: string;
  purchase_date: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number;
  category_id: string | null;
  notes: string | null;
  source_type: 'manual' | 'receipt_image';
  created_at: string;
  updated_at: string;
};

type ReceiptItemRow = {
  id: string;
  receipt_id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  category_id: string | null;
  created_at: string;
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

type ReportRow = {
  id: string;
  user_id: string;
  month: string;
  summary_json: string;
  ai_advice_json: string;
  records_version: number;
  created_at: string;
  updated_at: string;
};

export type ReportData = {
  receipts: Receipt[];
  items: ReceiptItem[];
  budgets: Budget[];
  previousMonthReceipts: Receipt[];
};

export type MonthlyReport = {
  id: string;
  userId: string;
  month: string;
  summary: MonthlySummary;
  advice: ReportAdvice;
  recordsVersion: number;
  aiStatus: 'ready';
  createdAt: string;
  updatedAt: string;
};

function nextMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const next = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  return String(nextYear).padStart(4, '0') + '-' + String(next).padStart(2, '0');
}

function previousMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const previous = monthNumber === 1 ? 12 : monthNumber - 1;
  const previousYear = monthNumber === 1 ? year - 1 : year;
  return String(previousYear).padStart(4, '0') + '-' + String(previous).padStart(2, '0');
}

function rowToReceipt(row: ReceiptRow) {
  return rowToCamel(row) as Receipt;
}

function rowToReceiptItem(row: ReceiptItemRow) {
  return rowToCamel(row) as ReceiptItem;
}

function rowToBudget(row: BudgetRow) {
  return rowToCamel(row) as Budget;
}

function parseReport(row: ReportRow): MonthlyReport | null {
  try {
    return {
      id: row.id,
      userId: row.user_id,
      month: row.month,
      summary: JSON.parse(row.summary_json) as MonthlySummary,
      advice: JSON.parse(row.ai_advice_json) as ReportAdvice,
      recordsVersion: row.records_version,
      aiStatus: 'ready',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch {
    return null;
  }
}

async function listReceiptsForMonth(db: D1Database, userId: string, month: string) {
  const result = await db
    .prepare('SELECT * FROM receipts WHERE user_id = ? AND purchase_date >= ? AND purchase_date < ? ORDER BY purchase_date, created_at')
    .bind(userId, month + '-01', nextMonth(month) + '-01')
    .all<ReceiptRow>();
  return result.results.map(rowToReceipt);
}

export async function getCurrentRecordsVersion(db: D1Database, userId: string, month: string) {
  const row = await db
    .prepare('SELECT records_version FROM user_month_versions WHERE user_id = ? AND month = ?')
    .bind(userId, month)
    .first<{ records_version: number }>();
  return row?.records_version ?? 0;
}

export async function getReportData(db: D1Database, userId: string, month: string): Promise<ReportData> {
  const receipts = await listReceiptsForMonth(db, userId, month);
  const previousMonthReceipts = await listReceiptsForMonth(db, userId, previousMonth(month));
  const itemResult = await db
    .prepare(
      `SELECT receipt_items.*
       FROM receipt_items
       INNER JOIN receipts ON receipts.id = receipt_items.receipt_id AND receipts.user_id = receipt_items.user_id
       WHERE receipt_items.user_id = ? AND receipts.purchase_date >= ? AND receipts.purchase_date < ?
       ORDER BY receipt_items.created_at, receipt_items.id`
    )
    .bind(userId, month + '-01', nextMonth(month) + '-01')
    .all<ReceiptItemRow>();
  const items = itemResult.results.map(rowToReceiptItem);
  const budgetResult = await db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ? ORDER BY category_id').bind(userId, month).all<BudgetRow>();
  return { receipts, items, budgets: budgetResult.results.map(rowToBudget), previousMonthReceipts };
}

export async function getCurrentCachedReport(db: D1Database, userId: string, month: string) {
  const recordsVersion = await getCurrentRecordsVersion(db, userId, month);
  const row = await db
    .prepare('SELECT * FROM monthly_reports WHERE user_id = ? AND month = ? AND records_version = ?')
    .bind(userId, month, recordsVersion)
    .first<ReportRow>();
  return row ? parseReport(row) : null;
}

export async function saveMonthlyReport(
  db: D1Database,
  input: { userId: string; month: string; summary: MonthlySummary; advice: ReportAdvice; recordsVersion: number }
) {
  const id = newId('report');
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO monthly_reports (id, user_id, month, summary_json, ai_advice_json, records_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, month) DO UPDATE SET
         summary_json = excluded.summary_json,
         ai_advice_json = excluded.ai_advice_json,
         records_version = excluded.records_version,
         updated_at = excluded.updated_at`
    )
    .bind(id, input.userId, input.month, JSON.stringify(input.summary), JSON.stringify(input.advice), input.recordsVersion, now, now)
    .run();
  const cached = await getCurrentCachedReport(db, input.userId, input.month);
  if (!cached) throw new Error('Failed to save monthly report');
  return cached;
}
