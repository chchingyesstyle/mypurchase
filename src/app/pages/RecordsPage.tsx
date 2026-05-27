import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { localMonthInputValue } from '../utils/localDate';

type ReceiptRow = {
  id: string;
  merchant: string;
  purchaseDate: string;
  currency: string;
  total: number;
  categoryId: string | null;
  sourceType: string;
};

export function RecordsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [month, setMonth] = useState(currentMonth());
  const [query, setQuery] = useState('');
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (query.trim()) params.set('q', query.trim());

    apiRequest<{ receipts: ReceiptRow[] }>(`/api/receipts?${params.toString()}`)
      .then((response) => {
        if (active) setReceipts(response.receipts);
      })
      .catch(() => {
        if (active) setReceipts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [month, query]);

  const columns = useMemo<DataTableColumn<ReceiptRow>[]>(
    () => [
      { key: 'merchant', header: 'Merchant', render: (receipt) => receipt.merchant },
      { key: 'date', header: 'Date', render: (receipt) => receipt.purchaseDate },
      { key: 'source', header: 'Source', render: (receipt) => sourceLabel(receipt.sourceType) },
      { key: 'total', header: 'Total', className: 'money-column', render: (receipt) => formatMoney(receipt.total, receipt.currency) }
    ],
    []
  );

  return (
    <section className="workspace-page" aria-labelledby="records-heading">
      <div className="page-header">
        <div>
          <p className="eyebrow">Purchases</p>
          <h1 id="records-heading">Records</h1>
        </div>
      </div>

      <div className="controls-row">
        <label>
          <span>Month</span>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <label className="search-field">
          <span>Search</span>
          <span className="input-with-icon">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </span>
        </label>
      </div>

      <DataTable
        columns={columns}
        emptyMessage={
          <p>
            {loading ? 'Loading records.' : 'No receipt records found. '}
            {!loading ? (
              <a href="#upload" onClick={(event) => { event.preventDefault(); onNavigate('upload'); }}>
                Upload a receipt
              </a>
            ) : null}
          </p>
        }
        getRowKey={(receipt) => receipt.id}
        rows={receipts}
      />
    </section>
  );
}

export function formatMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
}

function currentMonth() {
  return localMonthInputValue();
}

function sourceLabel(sourceType: string) {
  return sourceType === 'receipt_image' ? 'Receipt image' : 'Manual';
}
