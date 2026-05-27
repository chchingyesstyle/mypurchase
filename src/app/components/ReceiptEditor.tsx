import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Category, ReceiptInput, ReceiptItemInput } from '../../shared/types';
import { localDateInputValue } from '../utils/localDate';
import { Button } from './Button';

export type ReceiptDraft = Omit<ReceiptInput, 'subtotal' | 'tax' | 'discount' | 'total' | 'items'> & {
  subtotal?: number | null;
  tax?: number | null;
  discount?: number | null;
  total?: number | null;
  categoryName?: string | null;
  categoryHint?: string | null;
  items: Array<
    Omit<ReceiptItemInput, 'unitPrice' | 'totalPrice'> & {
      unitPrice?: number | null;
      totalPrice?: number | null;
      categoryName?: string | null;
      categoryHint?: string | null;
    }
  >;
};

type ReceiptEditorState = {
  merchant: string;
  purchaseDate: string;
  currency: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  categoryId: string;
  notes: string;
  sourceType: 'manual' | 'receipt_image';
  items: ItemState[];
};

type ItemState = {
  clientId: string;
  name: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  categoryId: string;
};

class FormValidationError extends Error {}

export function ReceiptEditor({
  categories,
  draft,
  onSave
}: {
  categories: Category[];
  draft: ReceiptDraft;
  onSave: (payload: ReceiptInput) => Promise<void>;
}) {
  const [form, setForm] = useState(() => stateFromDraft(draft));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const categoryOptions = useMemo(() => categories.map((category) => ({ id: category.id, name: category.name })), [categories]);

  useEffect(() => {
    setForm(stateFromDraft(draft));
    setError(null);
  }, [draft]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    let payload: ReceiptInput;
    try {
      payload = payloadFromState(form);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Receipt has invalid values.');
      return;
    }

    setSaving(true);
    try {
      await onSave(payload);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Receipt could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof ReceiptEditorState>(field: K, value: ReceiptEditorState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateItem(clientId: string, changes: Partial<ItemState>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.clientId === clientId ? { ...item, ...changes } : item))
    }));
  }

  function addItem() {
    setForm((current) => ({
      ...current,
      items: [...current.items, emptyItem()]
    }));
  }

  function removeItem(clientId: string) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.clientId !== clientId)
    }));
  }

  return (
    <form className="receipt-editor" onSubmit={handleSubmit}>
      <div className="editor-panel">
        <div className="section-heading compact-heading">
          <h2>Receipt details</h2>
        </div>
        <div className="form-grid">
          <label>
            <span>Merchant</span>
            <input required value={form.merchant} onChange={(event) => updateField('merchant', event.target.value)} />
          </label>
          <label>
            <span>Purchase date</span>
            <input required type="date" value={form.purchaseDate} onChange={(event) => updateField('purchaseDate', event.target.value)} />
          </label>
          <label>
            <span>Currency</span>
            <input maxLength={3} required value={form.currency} onChange={(event) => updateField('currency', event.target.value.toUpperCase())} />
          </label>
          <label>
            <span>Category</span>
            <select value={form.categoryId} onChange={(event) => updateField('categoryId', event.target.value)}>
              <option value="">Uncategorized</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <MoneyField label="Subtotal" value={form.subtotal} onChange={(value) => updateField('subtotal', value)} />
          <MoneyField label="Tax" value={form.tax} onChange={(value) => updateField('tax', value)} />
          <MoneyField label="Discount" value={form.discount} onChange={(value) => updateField('discount', value)} />
          <MoneyField label="Total" required value={form.total} onChange={(value) => updateField('total', value)} />
          <label className="wide-field">
            <span>Notes</span>
            <textarea rows={3} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />
          </label>
        </div>
      </div>

      <div className="editor-panel">
        <div className="section-heading split-heading">
          <h2>Item lines</h2>
          <Button icon={<Plus size={15} />} onClick={addItem} variant="secondary">
            Add item
          </Button>
        </div>
        <div className="table-scroll">
          <table className="data-table item-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit</th>
                <th scope="col">Total</th>
                <th scope="col">Category</th>
                <th className="action-column" scope="col">Remove</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item) => (
                <tr aria-label={`Item ${item.name || 'line'}`} key={item.clientId}>
                  <td>
                    <input aria-label="Item name" required value={item.name} onChange={(event) => updateItem(item.clientId, { name: event.target.value })} />
                  </td>
                  <td>
                    <input
                      aria-label="Quantity"
                      inputMode="decimal"
                      required
                      value={item.quantity}
                      onChange={(event) => updateItem(item.clientId, { quantity: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Unit price"
                      inputMode="decimal"
                      required
                      value={item.unitPrice}
                      onChange={(event) => updateItem(item.clientId, { unitPrice: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Line total"
                      inputMode="decimal"
                      required
                      value={item.totalPrice}
                      onChange={(event) => updateItem(item.clientId, { totalPrice: event.target.value })}
                    />
                  </td>
                  <td>
                    <select aria-label="Item category" value={item.categoryId} onChange={(event) => updateItem(item.clientId, { categoryId: event.target.value })}>
                      <option value="">Uncategorized</option>
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="action-column">
                    <Button aria-label={`Remove ${item.name || 'item'}`} className="icon-button" icon={<Trash2 size={15} />} onClick={() => removeItem(item.clientId)} variant="ghost">
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <Button disabled={saving} icon={<Save size={16} />} type="submit" variant="primary">
          {saving ? 'Saving' : 'Save receipt'}
        </Button>
      </div>
    </form>
  );
}

function MoneyField({ label, onChange, required = false, value }: { label: string; onChange: (value: string) => void; required?: boolean; value: string }) {
  return (
    <label>
      <span>{label}</span>
      <input aria-label={label} inputMode="decimal" required={required} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function stateFromDraft(draft: ReceiptDraft): ReceiptEditorState {
  return {
    merchant: draft.merchant ?? '',
    purchaseDate: draft.purchaseDate || localDateInputValue(),
    currency: draft.currency || 'USD',
    subtotal: moneyToDecimal(draft.subtotal),
    tax: moneyToDecimal(draft.tax),
    discount: moneyToDecimal(draft.discount),
    total: moneyToDecimal(draft.total ?? 0),
    categoryId: draft.categoryId ?? '',
    notes: draft.notes ?? '',
    sourceType: draft.sourceType ?? 'manual',
    items: draft.items.map((item) => ({
      clientId: crypto.randomUUID(),
      name: item.name ?? '',
      quantity: String(item.quantity ?? 1),
      unitPrice: moneyToDecimal(item.unitPrice ?? 0),
      totalPrice: moneyToDecimal(item.totalPrice ?? 0),
      categoryId: item.categoryId ?? ''
    }))
  };
}

function payloadFromState(form: ReceiptEditorState): ReceiptInput {
  return {
    merchant: form.merchant.trim(),
    purchaseDate: form.purchaseDate,
    currency: form.currency.trim().toUpperCase(),
    subtotal: optionalMoney('Subtotal', form.subtotal),
    tax: optionalMoney('Tax', form.tax),
    discount: optionalMoney('Discount', form.discount),
    total: requiredMoney('Total', form.total),
    categoryId: form.categoryId || null,
    notes: form.notes.trim() || null,
    sourceType: form.sourceType,
    items: form.items.map((item, index) => ({
      name: item.name.trim(),
      quantity: Number(item.quantity),
      unitPrice: requiredMoney(`Item ${index + 1} unit price`, item.unitPrice),
      totalPrice: requiredMoney(`Item ${index + 1} line total`, item.totalPrice),
      categoryId: item.categoryId || null
    }))
  };
}

function emptyItem(): ItemState {
  return {
    clientId: crypto.randomUUID(),
    name: '',
    quantity: '1',
    unitPrice: '0.00',
    totalPrice: '0.00',
    categoryId: ''
  };
}

function moneyToDecimal(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return (value / 100).toFixed(2);
}

function optionalMoney(label: string, value: string) {
  return value.trim() === '' ? null : requiredMoney(label, value);
}

function requiredMoney(label: string, value: string) {
  const parsed = parseMoney(value);
  if (parsed === null) throw new FormValidationError(`${label} must be a valid non-negative amount.`);
  return parsed;
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}
