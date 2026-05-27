import { Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Category } from '../../shared/types';
import { apiRequest } from '../api/client';
import { Button } from '../components/Button';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { localMonthInputValue } from '../utils/localDate';
import { formatMoney } from './RecordsPage';

type BudgetRow = {
  categoryId: string;
  month: string;
  amount: number;
  currency: string;
  createdAt?: string;
  updatedAt?: string;
};

export function BudgetsPage() {
  const [month, setMonth] = useState(localMonthInputValue());
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ categories: Category[] }>('/api/categories')
      .then((response) => {
        if (!active) return;
        setCategories(response.categories);
        setCategoryId((current) => current || response.categories[0]?.id || '');
      })
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<{ budgets: BudgetRow[] }>(`/api/budgets?month=${encodeURIComponent(month)}`)
      .then((response) => {
        if (active) setBudgets(response.budgets);
      })
      .catch(() => {
        if (active) setBudgets([]);
      });
    return () => {
      active = false;
    };
  }, [month]);

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  async function saveBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!categoryId) {
      setError('Choose a category before saving a budget.');
      return;
    }

    const minorUnits = parseMoney(amount);
    if (minorUnits === null) {
      setError('Amount must be a valid non-negative amount.');
      return;
    }

    try {
      const response = await apiRequest<{ budget: BudgetRow }>(`/api/budgets/${encodeURIComponent(categoryId)}/${encodeURIComponent(month)}`, {
        method: 'PUT',
        body: { amount: minorUnits, currency: 'USD' }
      });
      setBudgets((current) => [...current.filter((budget) => budget.categoryId !== response.budget.categoryId), response.budget]);
      setAmount('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Budget could not be saved.');
    }
  }

  const columns: DataTableColumn<BudgetRow>[] = [
    { key: 'category', header: 'Category', render: (budget) => categoryNames.get(budget.categoryId) ?? budget.categoryId },
    { key: 'month', header: 'Month', render: (budget) => budget.month },
    { key: 'amount', header: 'Budget', className: 'money-column', render: (budget) => formatMoney(budget.amount, budget.currency) }
  ];

  return (
    <section className="workspace-page" aria-labelledby="budgets-heading">
      <div className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 id="budgets-heading">Budgets</h1>
        </div>
      </div>

      <div className="controls-row">
        <label>
          <span>Month</span>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
      </div>

      <form className="inline-form" onSubmit={saveBudget}>
        <label>
          <span>Category</span>
          <select disabled={categories.length === 0} required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.length === 0 ? <option value="">No categories available</option> : null}
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Amount</span>
          <input inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <Button disabled={categories.length === 0} icon={<Save size={16} />} type="submit" variant="primary">
          Save budget
        </Button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <DataTable columns={columns} emptyMessage={<p>No budgets set for this month.</p>} getRowKey={(budget) => `${budget.categoryId}-${budget.month}`} rows={budgets} />
    </section>
  );
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}
