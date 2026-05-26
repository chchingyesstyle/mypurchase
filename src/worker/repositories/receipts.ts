import { findVisibleCategory } from './categories';
import { newId, nowIso, rowToCamel } from './db';
import { incrementUserMonthVersion, incrementUserMonthVersions } from './monthVersions';

export type ReceiptItemInput = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryId?: string | null;
};

export type ReceiptInput = {
  merchant: string;
  purchaseDate: string;
  currency: string;
  subtotal?: number | null;
  tax?: number | null;
  discount?: number | null;
  total: number;
  categoryId?: string | null;
  notes?: string | null;
  sourceType: 'manual' | 'receipt_image';
  items: ReceiptItemInput[];
};

export type Receipt = {
  id: string;
  userId: string;
  merchant: string;
  purchaseDate: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number;
  categoryId: string | null;
  notes: string | null;
  sourceType: 'manual' | 'receipt_image';
  createdAt: string;
  updatedAt: string;
};

export type ReceiptItem = {
  id: string;
  receiptId: string;
  userId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryId: string | null;
  createdAt: string;
};

export type ReceiptDetail = Receipt & {
  items: ReceiptItem[];
};

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

export type ReceiptListFilters = {
  month?: string;
  merchant?: string;
  categoryId?: string;
  q?: string;
};

function rowToReceipt(row: ReceiptRow) {
  return rowToCamel(row) as Receipt;
}

function rowToReceiptItem(row: ReceiptItemRow) {
  return rowToCamel(row) as ReceiptItem;
}

function receiptMonth(receipt: Pick<Receipt | ReceiptInput, 'purchaseDate'>) {
  return receipt.purchaseDate.slice(0, 7);
}

async function categoriesAreVisible(db: D1Database, userId: string, categoryIds: Array<string | null | undefined>) {
  const uniqueIds = [...new Set(categoryIds.filter((categoryId): categoryId is string => Boolean(categoryId)))];
  for (const categoryId of uniqueIds) {
    if (!(await findVisibleCategory(db, userId, categoryId))) return false;
  }
  return true;
}

async function findOwnedReceipt(db: D1Database, userId: string, receiptId: string) {
  const row = await db.prepare('SELECT * FROM receipts WHERE id = ? AND user_id = ?').bind(receiptId, userId).first<ReceiptRow>();
  return row ? rowToReceipt(row) : null;
}

function insertReceiptItemStatements(
  db: D1Database,
  input: {
    receiptId: string;
    userId: string;
    createdAt: string;
    items: ReceiptItemInput[];
  }
) {
  return input.items.map((item) =>
    db
      .prepare("INSERT INTO receipt_items (id, receipt_id, user_id, name, quantity, unit_price, total_price, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(
        newId("ritem"),
        input.receiptId,
        input.userId,
        item.name,
        item.quantity,
        item.unitPrice,
        item.totalPrice,
        item.categoryId ?? null,
        input.createdAt
      )
  );
}

export async function createReceipt(db: D1Database, userId: string, input: ReceiptInput) {
  if (!(await categoriesAreVisible(db, userId, [input.categoryId, ...input.items.map((item) => item.categoryId)]))) {
    return null;
  }

  const id = newId('receipt');
  const now = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO receipts
           (id, user_id, merchant, purchase_date, currency, subtotal, tax, discount, total, category_id, notes, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        userId,
        input.merchant,
        input.purchaseDate,
        input.currency,
        input.subtotal ?? null,
        input.tax ?? null,
        input.discount ?? null,
        input.total,
        input.categoryId ?? null,
        input.notes ?? null,
        input.sourceType,
        now,
        now
      ),
    ...insertReceiptItemStatements(db, { receiptId: id, userId, createdAt: now, items: input.items })
  ]);
  await incrementUserMonthVersion(db, userId, receiptMonth(input));

  const receipt = await getReceiptDetail(db, userId, id);
  if (!receipt) throw new Error('Failed to create receipt');
  return receipt;
}

export async function listReceipts(db: D1Database, userId: string, filters: ReceiptListFilters = {}) {
  const clauses = ['user_id = ?'];
  const values: unknown[] = [userId];
  if (filters.month) {
    clauses.push("purchase_date >= ? AND purchase_date < date(?, '+1 month')");
    values.push(`${filters.month}-01`, `${filters.month}-01`);
  }
  if (filters.merchant) {
    clauses.push('merchant LIKE ?');
    values.push(`%${filters.merchant}%`);
  }
  if (filters.categoryId) {
    clauses.push('category_id = ?');
    values.push(filters.categoryId);
  }
  if (filters.q) {
    clauses.push('(merchant LIKE ? OR notes LIKE ?)');
    values.push(`%${filters.q}%`, `%${filters.q}%`);
  }

  const result = await db
    .prepare(`SELECT * FROM receipts WHERE ${clauses.join(' AND ')} ORDER BY purchase_date DESC, created_at DESC`)
    .bind(...values)
    .all<ReceiptRow>();
  return result.results.map(rowToReceipt);
}

export async function getReceiptDetail(db: D1Database, userId: string, receiptId: string) {
  const receipt = await findOwnedReceipt(db, userId, receiptId);
  if (!receipt) return null;

  const result = await db
    .prepare('SELECT * FROM receipt_items WHERE receipt_id = ? AND user_id = ? ORDER BY created_at, id')
    .bind(receiptId, userId)
    .all<ReceiptItemRow>();
  return { ...receipt, items: result.results.map(rowToReceiptItem) };
}

export async function updateReceipt(db: D1Database, userId: string, receiptId: string, input: ReceiptInput) {
  const existing = await findOwnedReceipt(db, userId, receiptId);
  if (!existing) return null;
  if (!(await categoriesAreVisible(db, userId, [input.categoryId, ...input.items.map((item) => item.categoryId)]))) {
    return null;
  }

  const now = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE receipts
         SET merchant = ?, purchase_date = ?, currency = ?, subtotal = ?, tax = ?, discount = ?,
             total = ?, category_id = ?, notes = ?, source_type = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .bind(
        input.merchant,
        input.purchaseDate,
        input.currency,
        input.subtotal ?? null,
        input.tax ?? null,
        input.discount ?? null,
        input.total,
        input.categoryId ?? null,
        input.notes ?? null,
        input.sourceType,
        now,
        receiptId,
        userId
      ),
    db.prepare('DELETE FROM receipt_items WHERE receipt_id = ? AND user_id = ?').bind(receiptId, userId),
    ...insertReceiptItemStatements(db, { receiptId, userId, createdAt: now, items: input.items })
  ]);
  await incrementUserMonthVersions(db, userId, [...new Set([receiptMonth(existing), receiptMonth(input)])]);

  return getReceiptDetail(db, userId, receiptId);
}

export async function deleteReceipt(db: D1Database, userId: string, receiptId: string) {
  const existing = await findOwnedReceipt(db, userId, receiptId);
  if (!existing) return false;

  await db.prepare('DELETE FROM receipts WHERE id = ? AND user_id = ?').bind(receiptId, userId).run();
  await incrementUserMonthVersion(db, userId, receiptMonth(existing));
  return true;
}
