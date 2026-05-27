import { AlertTriangle, Landmark, ReceiptText, Repeat2, ShoppingBasket, Store, Tags } from 'lucide-react';
import { formatMoney } from '../pages/RecordsPage';

export type MonthlyReportSummary = {
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

type ReportChartsProps = {
  summary: MonthlyReportSummary;
};

type MoneyRow = {
  key: string;
  label: string;
  detail: string;
  total: number;
  currency?: string | null;
};

export function ReportCharts({ summary }: ReportChartsProps) {
  const currency = summary.totals.currency ?? 'USD';

  return (
    <>
      <section className="report-panel">
        <div className="section-heading">
          <Tags size={17} />
          <h2>Category breakdown</h2>
        </div>
        <MoneyBars
          emptyText="No category spend in this report."
          rows={summary.categoryTotals.map((category) => ({
            key: category.categoryId ?? 'uncategorized',
            label: categoryLabel(category.categoryId),
            detail: `${category.receiptCount} ${plural(category.receiptCount, 'receipt')} · ${formatMoney(category.itemTotal, currency)} item total`,
            total: category.total,
            currency
          }))}
        />
      </section>

      <section className="report-panel">
        <div className="section-heading">
          <Store size={17} />
          <h2>Merchant breakdown</h2>
        </div>
        <MoneyBars
          emptyText="No merchant spend in this report."
          rows={summary.merchantTotals.map((merchant) => ({
            key: merchant.merchant,
            label: merchant.merchant,
            detail: `${merchant.receiptCount} ${plural(merchant.receiptCount, 'receipt')}`,
            total: merchant.total,
            currency
          }))}
        />
      </section>

      <section className="report-panel">
        <div className="section-heading">
          <Landmark size={17} />
          <h2>Budget status</h2>
        </div>
        {summary.budgetStatus.length === 0 ? (
          <p className="muted-copy">No budgets were set for this month.</p>
        ) : (
          <div className="budget-list">
            {summary.budgetStatus.map((budget) => (
              <div className="budget-row" key={budget.categoryId}>
                <div>
                  <strong>{categoryLabel(budget.categoryId)}</strong>
                  <span>
                    {formatMoney(budget.spent, budget.currency)} of {formatMoney(budget.amount, budget.currency)}
                  </span>
                </div>
                <div className="budget-meter" aria-label={`${categoryLabel(budget.categoryId)} budget used ${budget.percentUsed}%`}>
                  <span className={`budget-fill budget-${budget.status}`} style={{ width: `${Math.min(budget.percentUsed, 100)}%` }} />
                </div>
                <strong className={`budget-value budget-text-${budget.status}`}>{budget.percentUsed}%</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="report-panel">
        <div className="section-heading">
          <Repeat2 size={17} />
          <h2>Recurring purchases</h2>
        </div>
        {summary.recurringItemCandidates.length === 0 ? (
          <p className="muted-copy">No recurring item candidates found.</p>
        ) : (
          <div className="insight-list">
            {summary.recurringItemCandidates.map((item) => (
              <div className="insight-row" key={item.normalizedName}>
                <span className="insight-icon">{item.count}</span>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {formatMoney(item.total, currency)} across {item.merchants.join(', ') || 'unknown merchant'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="report-panel">
        <div className="section-heading">
          <ShoppingBasket size={17} />
          <h2>Item insights</h2>
        </div>
        {summary.itemTotals.length === 0 ? (
          <p className="muted-copy">No item-level rows in this report.</p>
        ) : (
          <div className="insight-list">
            {summary.itemTotals.slice(0, 6).map((item) => (
              <div className="insight-row" key={item.normalizedName}>
                <span className="insight-icon">{item.count}</span>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {formatMoney(item.total, currency)} · quantity {item.quantity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="report-panel">
        <div className="section-heading">
          <AlertTriangle size={17} />
          <h2>Changes to watch</h2>
        </div>
        {summary.unusualIncreases.length === 0 ? (
          <p className="muted-copy">No unusual increases crossed the report threshold.</p>
        ) : (
          <div className="insight-list">
            {summary.unusualIncreases.map((increase) => (
              <div className="insight-row" key={`${increase.type}-${increase.merchant ?? increase.categoryId ?? 'uncategorized'}`}>
                <span className="insight-icon">+{formatCompactMoney(increase.increase, currency)}</span>
                <div>
                  <strong>{increase.merchant ?? categoryLabel(increase.categoryId)}</strong>
                  <span>
                    {formatMoney(increase.currentTotal, currency)} now, {formatMoney(increase.previousTotal, currency)} last month
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="report-panel report-comparison-panel">
        <div className="section-heading">
          <ReceiptText size={17} />
          <h2>Month comparison</h2>
        </div>
        <div className="comparison-grid">
          <Metric label={`${summary.previousMonthComparisons.month || 'Previous'} total`} value={formatMoney(summary.previousMonthComparisons.total, currency)} />
          <Metric label="Delta" value={signedMoney(summary.previousMonthComparisons.delta, currency)} />
          <Metric label="Change" value={summary.previousMonthComparisons.percentChange === null ? 'n/a' : `${summary.previousMonthComparisons.percentChange}%`} />
        </div>
      </section>
    </>
  );
}

function MoneyBars({ rows, emptyText }: { rows: MoneyRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="muted-copy">{emptyText}</p>;
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <div className="bar-list">
      {rows.map((row) => (
        <div className="bar-row" key={row.key}>
          <div className="bar-row-text">
            <strong>{row.label}</strong>
            <span>{row.detail}</span>
          </div>
          <div className="bar-track" aria-label={`${row.label} ${formatMoney(row.total, row.currency ?? 'USD')}`}>
            <span style={{ width: `${Math.max(4, Math.round((row.total / max) * 100))}%` }} />
          </div>
          <strong className="bar-value">{formatMoney(row.total, row.currency ?? 'USD')}</strong>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="comparison-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function categoryLabel(categoryId: string | null | undefined) {
  if (!categoryId) return 'Uncategorized';
  return categoryId
    .replace(/^cat(_builtin)?_/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function plural(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

function signedMoney(value: number, currency: string) {
  const formatted = formatMoney(Math.abs(value), currency);
  if (value === 0) return formatted;
  return `${value > 0 ? '+' : '-'}${formatted}`;
}

function formatCompactMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value / 100);
}
