import type { Budget } from '../repositories/budgets';
import type { Receipt, ReceiptItem } from '../repositories/receipts';

export type SummaryReceipt = Receipt;
export type SummaryReceiptItem = ReceiptItem;

export type MonthlySummary = {
  totals: {
    total: number;
    subtotal: number;
    tax: number;
    discount: number;
    receiptCount: number;
    itemCount: number;
    currency: string | null;
  };
  categoryTotals: Array<{ categoryId: string | null; total: number; receiptCount: number; itemTotal: number }>;
  merchantTotals: Array<{ merchant: string; total: number; receiptCount: number }>;
  itemTotals: Array<{ normalizedName: string; name: string; total: number; quantity: number; count: number; categoryId: string | null }>;
  recurringItemCandidates: Array<{ normalizedName: string; name: string; count: number; total: number; merchants: string[] }>;
  unusualIncreases: Array<{
    type: 'merchant' | 'category';
    merchant?: string;
    categoryId?: string | null;
    currentTotal: number;
    previousTotal: number;
    increase: number;
  }>;
  budgetStatus: Array<{
    categoryId: string;
    currency: string;
    amount: number;
    spent: number;
    remaining: number;
    percentUsed: number;
    status: 'under' | 'near' | 'over';
  }>;
  previousMonthComparisons: {
    month: string;
    total: number;
    delta: number;
    percentChange: number | null;
    categoryTotals: Array<{ categoryId: string | null; currentTotal: number; previousTotal: number; delta: number }>;
    merchantTotals: Array<{ merchant: string; currentTotal: number; previousTotal: number; delta: number }>;
  };
};

type BuildMonthlySummaryInput = {
  receipts: SummaryReceipt[];
  items: SummaryReceiptItem[];
  budgets: Budget[];
  previousMonthReceipts: SummaryReceipt[];
};

type ReceiptGroup = {
  total: number;
  receiptIds: Set<string>;
};

type ItemGroup = {
  normalizedName: string;
  name: string;
  total: number;
  quantity: number;
  count: number;
  categoryId: string | null;
  merchants: Set<string>;
};

export function normalizeItemName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function previousMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const previous = monthNumber === 1 ? 12 : monthNumber - 1;
  const previousYear = monthNumber === 1 ? year - 1 : year;
  return String(previousYear).padStart(4, '0') + '-' + String(previous).padStart(2, '0');
}

function receiptMonth(receipts: SummaryReceipt[]) {
  const firstReceipt = receipts[0];
  return firstReceipt?.purchaseDate.slice(0, 7) ?? '';
}

function addReceiptGroup(map: Map<string, ReceiptGroup>, key: string, receipt: SummaryReceipt) {
  const group = map.get(key) ?? { total: 0, receiptIds: new Set<string>() };
  group.total += receipt.total;
  group.receiptIds.add(receipt.id);
  map.set(key, group);
}

function sortedByTotalThenName<T extends { total: number }>(values: T[], name: (value: T) => string) {
  return values.sort((left, right) => right.total - left.total || name(left).localeCompare(name(right)));
}

function categoryMap(receipts: SummaryReceipt[]) {
  const map = new Map<string, ReceiptGroup>();
  for (const receipt of receipts) addReceiptGroup(map, receipt.categoryId ?? '__uncategorized__', receipt);
  return map;
}

function merchantMap(receipts: SummaryReceipt[]) {
  const map = new Map<string, ReceiptGroup>();
  for (const receipt of receipts) addReceiptGroup(map, receipt.merchant, receipt);
  return map;
}

function comparisonRows(current: Map<string, ReceiptGroup>, previous: Map<string, ReceiptGroup>, label: 'category' | 'merchant') {
  const keys = [...new Set([...current.keys(), ...previous.keys()])];
  return keys
    .map((key) => {
      const currentTotal = current.get(key)?.total ?? 0;
      const previousTotal = previous.get(key)?.total ?? 0;
      const base = { currentTotal, previousTotal, delta: currentTotal - previousTotal };
      return label === 'category'
        ? { categoryId: key === '__uncategorized__' ? null : key, ...base }
        : { merchant: key, ...base };
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
}

export function buildMonthlySummary(input: BuildMonthlySummaryInput): MonthlySummary {
  const categoryGroups = categoryMap(input.receipts);
  const previousCategoryGroups = categoryMap(input.previousMonthReceipts);
  const merchantGroups = merchantMap(input.receipts);
  const previousMerchantGroups = merchantMap(input.previousMonthReceipts);
  const receiptById = new Map(input.receipts.map((receipt) => [receipt.id, receipt]));
  const itemGroups = new Map<string, ItemGroup>();
  const currentMonth = receiptMonth(input.receipts) || input.budgets[0]?.month || '';
  const previousMonthName = currentMonth ? previousMonth(currentMonth) : '';

  let subtotal = 0;
  let tax = 0;
  let discount = 0;
  let total = 0;
  for (const receipt of input.receipts) {
    subtotal += receipt.subtotal ?? 0;
    tax += receipt.tax ?? 0;
    discount += receipt.discount ?? 0;
    total += receipt.total;
  }

  for (const item of input.items) {
    const normalizedName = normalizeItemName(item.name);
    if (!normalizedName) continue;
    const receipt = receiptById.get(item.receiptId);
    const group = itemGroups.get(normalizedName) ?? {
      normalizedName,
      name: item.name.trim(),
      total: 0,
      quantity: 0,
      count: 0,
      categoryId: item.categoryId,
      merchants: new Set<string>()
    };
    group.total += item.totalPrice;
    group.quantity += item.quantity;
    group.count += 1;
    if (!group.categoryId && item.categoryId) group.categoryId = item.categoryId;
    if (receipt) group.merchants.add(receipt.merchant);
    itemGroups.set(normalizedName, group);
  }

  const categoryTotals = sortedByTotalThenName(
    [...categoryGroups.entries()].map(([key, group]) => ({
      categoryId: key === '__uncategorized__' ? null : key,
      total: group.total,
      receiptCount: group.receiptIds.size,
      itemTotal: input.items.filter((item) => (item.categoryId ?? '__uncategorized__') === key).reduce((sum, item) => sum + item.totalPrice, 0)
    })),
    (value) => value.categoryId ?? ''
  );
  const merchantTotals = sortedByTotalThenName(
    [...merchantGroups.entries()].map(([merchant, group]) => ({ merchant, total: group.total, receiptCount: group.receiptIds.size })),
    (value) => value.merchant
  );
  const itemTotals = sortedByTotalThenName(
    [...itemGroups.values()].map((group) => ({
      normalizedName: group.normalizedName,
      name: group.name,
      total: group.total,
      quantity: group.quantity,
      count: group.count,
      categoryId: group.categoryId
    })),
    (value) => value.normalizedName
  );
  const recurringItemCandidates = itemTotals
    .filter((item) => item.count > 1)
    .map((item) => ({
      normalizedName: item.normalizedName,
      name: item.name,
      count: item.count,
      total: item.total,
      merchants: [...(itemGroups.get(item.normalizedName)?.merchants ?? new Set<string>())].sort()
    }));

  const categoryComparisons = comparisonRows(categoryGroups, previousCategoryGroups, 'category') as MonthlySummary['previousMonthComparisons']['categoryTotals'];
  const merchantComparisons = comparisonRows(merchantGroups, previousMerchantGroups, 'merchant') as MonthlySummary['previousMonthComparisons']['merchantTotals'];
  const unusualIncreases = [
    ...categoryComparisons
      .filter((row) => row.currentTotal > row.previousTotal && row.currentTotal - row.previousTotal >= 1000)
      .map((row) => ({
        type: 'category' as const,
        categoryId: row.categoryId,
        currentTotal: row.currentTotal,
        previousTotal: row.previousTotal,
        increase: row.delta
      })),
    ...merchantComparisons
      .filter((row) => row.currentTotal > row.previousTotal && row.currentTotal - row.previousTotal >= 1000)
      .map((row) => ({
        type: 'merchant' as const,
        merchant: row.merchant,
        currentTotal: row.currentTotal,
        previousTotal: row.previousTotal,
        increase: row.delta
      }))
  ].sort((left, right) => right.increase - left.increase);

  const budgetStatus = input.budgets
    .map((budget) => {
      const spent = categoryGroups.get(budget.categoryId)?.total ?? 0;
      const percentUsed = budget.amount === 0 ? (spent > 0 ? 100 : 0) : Math.round((spent / budget.amount) * 100);
      return {
        categoryId: budget.categoryId,
        currency: budget.currency,
        amount: budget.amount,
        spent,
        remaining: budget.amount - spent,
        percentUsed,
        status: spent > budget.amount ? ('over' as const) : percentUsed >= 80 ? ('near' as const) : ('under' as const)
      };
    })
    .sort((left, right) => right.percentUsed - left.percentUsed || left.categoryId.localeCompare(right.categoryId));

  const previousTotal = input.previousMonthReceipts.reduce((sum, receipt) => sum + receipt.total, 0);

  return {
    totals: {
      total,
      subtotal,
      tax,
      discount,
      receiptCount: input.receipts.length,
      itemCount: input.items.length,
      currency: input.receipts[0]?.currency ?? input.budgets[0]?.currency ?? null
    },
    categoryTotals,
    merchantTotals,
    itemTotals,
    recurringItemCandidates,
    unusualIncreases,
    budgetStatus,
    previousMonthComparisons: {
      month: previousMonthName,
      total: previousTotal,
      delta: total - previousTotal,
      percentChange: previousTotal === 0 ? null : Math.round(((total - previousTotal) / previousTotal) * 100),
      categoryTotals: categoryComparisons,
      merchantTotals: merchantComparisons
    }
  };
}
