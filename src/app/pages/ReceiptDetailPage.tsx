import { useEffect, useState } from 'react';
import type { Category, ReceiptInput } from '../../shared/types';
import { apiRequest } from '../api/client';
import { ReceiptEditor, type ReceiptDraft } from '../components/ReceiptEditor';

export function ReceiptDetailPage({ receiptId }: { receiptId: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ categories: Category[] }>('/api/categories'),
      apiRequest<{ receipt: ReceiptDraft }>(`/api/receipts/${encodeURIComponent(receiptId)}`)
    ])
      .then(([categoryResponse, receiptResponse]) => {
        if (!active) return;
        setCategories(categoryResponse.categories);
        setDraft(receiptResponse.receipt);
      })
      .catch(() => {
        if (active) setMessage('Receipt could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [receiptId]);

  async function saveReceipt(payload: ReceiptInput) {
    await apiRequest(`/api/receipts/${encodeURIComponent(receiptId)}`, { method: 'PUT', body: payload });
    setMessage('Receipt updated.');
  }

  return (
    <section className="workspace-page" aria-labelledby="receipt-detail-heading">
      <div className="page-header">
        <div>
          <p className="eyebrow">Record detail</p>
          <h1 id="receipt-detail-heading">Receipt detail</h1>
        </div>
      </div>
      {message ? <p className="success-note">{message}</p> : null}
      {draft ? <ReceiptEditor categories={categories} draft={draft} onSave={saveReceipt} /> : <div className="empty-state"><p>Loading receipt.</p></div>}
    </section>
  );
}
