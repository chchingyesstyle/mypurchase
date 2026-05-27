import { Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Category, ReceiptInput } from '../../shared/types';
import { apiRequest } from '../api/client';
import { Button } from '../components/Button';
import { ReceiptEditor, type ReceiptDraft } from '../components/ReceiptEditor';

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function UploadPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ categories: Category[] }>('/api/categories')
      .then((response) => {
        if (active) setCategories(response.categories);
      })
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function extractReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!file) {
      setError('Choose a receipt image before extracting.');
      return;
    }
    if (!supportedTypes.has(file.type)) {
      setError('Receipt file must be JPEG, PNG, or WebP.');
      return;
    }

    setExtracting(true);
    try {
      const formData = new FormData();
      formData.set('receipt', file);
      const response = await apiRequest<{ draft: ReceiptDraft }>('/api/extract-receipt', { method: 'POST', body: formData });
      setDraft(response.draft);
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Receipt could not be extracted.');
    } finally {
      setExtracting(false);
    }
  }

  async function saveReceipt(payload: ReceiptInput) {
    await apiRequest('/api/receipts', { method: 'POST', body: payload });
    setSaved(true);
    onNavigate('records');
  }

  return (
    <section className="workspace-page" aria-labelledby="upload-heading">
      <div className="page-header">
        <div>
          <p className="eyebrow">New record</p>
          <h1 id="upload-heading">Upload receipt</h1>
        </div>
      </div>

      <form className="upload-panel" onSubmit={extractReceipt}>
        <label className="file-field">
          <span>Receipt file</span>
          <input accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <Button disabled={extracting} icon={<Upload size={16} />} type="submit" variant="primary">
          {extracting ? 'Extracting' : 'Extract receipt'}
        </Button>
      </form>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {saved ? <p className="success-note">Receipt saved.</p> : null}
      {draft ? <ReceiptEditor categories={categories} draft={draft} onSave={saveReceipt} /> : null}
    </section>
  );
}
