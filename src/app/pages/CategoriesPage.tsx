import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Category } from '../../shared/types';
import { apiRequest } from '../api/client';
import { Button } from '../components/Button';
import { DataTable, type DataTableColumn } from '../components/DataTable';

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const response = await apiRequest<{ categories: Category[] }>('/api/categories');
      setCategories(response.categories);
    } catch {
      setCategories([]);
    }
  }

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const response = await apiRequest<{ category: Category }>('/api/categories', {
        method: 'POST',
        body: { name, color: '#2563eb', icon: 'tag' }
      });
      setCategories((current) => [...current, response.category]);
      setName('');
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Category could not be added.');
    }
  }

  const columns: DataTableColumn<Category>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (category) => (
        <span className="category-cell">
          <span className="category-swatch" style={{ background: category.color }} />
          {category.name}
        </span>
      )
    },
    { key: 'kind', header: 'Type', render: (category) => (category.kind === 'built_in' ? 'Built-in' : 'Custom') },
    { key: 'icon', header: 'Icon', render: (category) => category.icon }
  ];

  return (
    <section className="workspace-page" aria-labelledby="categories-heading">
      <div className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 id="categories-heading">Categories</h1>
        </div>
      </div>

      <form className="inline-form" onSubmit={addCategory}>
        <label>
          <span>Category name</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <Button icon={<Plus size={16} />} type="submit" variant="primary">
          Add category
        </Button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <DataTable columns={columns} emptyMessage={<p>No categories returned.</p>} getRowKey={(category) => category.id} rows={categories} />
    </section>
  );
}
