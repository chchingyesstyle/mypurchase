import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { Button } from '../components/Button';
import { DataTable, type DataTableColumn } from '../components/DataTable';
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
  const [month, setMonth] = useState(currentMonth());
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  async function saveBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const minorUnits = Math.round(Number(amount) * 100);
    try {
      const response = await apiRequest<{ budget: BudgetRow }>(`/api/budgets/${encodeURIComponent(categoryId)}/${encodeURIComponent(month)}`, {
        method: 'PUT',
        body: { amount: Number.isFinite(minorUnits) ? minorUnits : 0, currency: 'USD' }
      });
      setBudgets((current) => [...current.filter((budget) => budget.categoryId !== response.budget.categoryId), response.budget]);
      setCategoryId('');
      setAmount('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Budget could not be saved.');
    }
  }

  const columns: DataTableColumn<BudgetRow>[] = [
    { key: 'category', header: 'Category ID', render: (budget) => budget.categoryId },
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
          <span>Category ID</span>
          <input required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} />
        </label>
        <label>
          <span>Amount</span>
          <input inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <Button icon={<Save size={16} />} type="submit" variant="primary">
          Save budget
        </Button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <DataTable columns={columns} emptyMessage={<p>No budgets set for this month.</p>} getRowKey={(budget) => `${budget.categoryId}-${budget.month}`} rows={budgets} />
    </section>
  );
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
