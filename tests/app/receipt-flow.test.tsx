import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { setCsrfToken } from '../../src/app/api/client';
import type { Category, User } from '../../src/shared/types';

const member: User = {
  id: 'user_1',
  username: 'member',
  role: 'user',
  defaultCurrency: 'USD',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

const admin: User = { ...member, id: 'admin_1', username: 'admin', role: 'admin' };

const categories: Category[] = [
  {
    id: 'cat_builtin_groceries',
    userId: null,
    name: 'Groceries',
    kind: 'built_in',
    color: '#2563eb',
    icon: 'basket',
    createdAt: '2026-05-01T00:00:00.000Z'
  }
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function mockFetch(handler: (path: string, init: RequestInit | undefined) => unknown) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = input instanceof Request ? input.url : String(input);
    const body = handler(path, init);
    return body instanceof Response ? body : jsonResponse(body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function authenticatedFetch(user: User = member) {
  return mockFetch((path, init) => {
    const method = init?.method ?? 'GET';
    if (path === '/api/auth/me') return { user, csrfToken: 'csrf-current' };
    if (path === '/api/categories' && method === 'GET') return { categories };
    return { ok: true };
  });
}

describe('receipt management flow', () => {
  beforeEach(() => {
    window.location.hash = '';
    setCsrfToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates receipt files before submitting for extraction', async () => {
    const fetchMock = authenticatedFetch();
    window.location.hash = '#upload';

    render(<App />);

    await screen.findByRole('heading', { name: /upload receipt/i });
    const input = screen.getByLabelText(/receipt file/i);
    await userEvent.upload(input, new File(['not an image'], 'receipt.txt', { type: 'text/plain' }), { applyAccept: false });
    await userEvent.click(screen.getByRole('button', { name: /extract receipt/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/jpeg, png, or webp/i);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/extract-receipt', expect.anything());
  });

  it('populates the receipt editor, preserves edits, and saves integer minor units', async () => {
    let savedBody: unknown;
    mockFetch((path, init) => {
      const method = init?.method ?? 'GET';
      if (path === '/api/auth/me') return { user: member, csrfToken: 'csrf-current' };
      if (path === '/api/categories' && method === 'GET') return { categories };
      if (path === '/api/extract-receipt') {
        return {
          draft: {
            merchant: 'Corner Market',
            purchaseDate: '2026-05-12',
            currency: 'USD',
            subtotal: 1299,
            tax: 101,
            discount: 0,
            total: 1400,
            categoryId: 'cat_builtin_groceries',
            notes: 'Scanned from receipt',
            sourceType: 'receipt_image',
            items: [
              {
                name: 'Milk',
                quantity: 1,
                unitPrice: 499,
                totalPrice: 499,
                categoryId: 'cat_builtin_groceries'
              }
            ]
          }
        };
      }
      if (path === '/api/receipts' && method === 'POST') {
        savedBody = JSON.parse(String(init?.body));
        return jsonResponse({ receipt: { id: 'receipt_1', ...(savedBody as object) } }, 201);
      }
      return { ok: true };
    });
    window.location.hash = '#upload';

    render(<App />);

    await screen.findByRole('heading', { name: /upload receipt/i });
    await userEvent.upload(screen.getByLabelText(/receipt file/i), new File(['png'], 'receipt.png', { type: 'image/png' }));
    await userEvent.click(screen.getByRole('button', { name: /extract receipt/i }));

    expect(await screen.findByDisplayValue('Corner Market')).toBeInTheDocument();
    expect(screen.getByDisplayValue('14.00')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/^merchant$/i));
    await userEvent.type(screen.getByLabelText(/^merchant$/i), 'Neighborhood Co-op');
    const firstItem = screen.getByRole('row', { name: /milk/i });
    await userEvent.clear(within(firstItem).getByLabelText(/item name/i));
    await userEvent.type(within(firstItem).getByLabelText(/item name/i), 'Oat milk');
    await userEvent.clear(within(firstItem).getByLabelText(/unit price/i));
    await userEvent.type(within(firstItem).getByLabelText(/unit price/i), '5.25');
    await userEvent.clear(within(firstItem).getByLabelText(/line total/i));
    await userEvent.type(within(firstItem).getByLabelText(/line total/i), '5.25');
    await userEvent.clear(screen.getByLabelText(/^total$/i));
    await userEvent.type(screen.getByLabelText(/^total$/i), '14.26');
    await userEvent.click(screen.getByRole('button', { name: /save receipt/i }));

    await waitFor(() =>
      expect(savedBody).toMatchObject({
        merchant: 'Neighborhood Co-op',
        total: 1426,
        subtotal: 1299,
        tax: 101,
        sourceType: 'receipt_image',
        items: [expect.objectContaining({ name: 'Oat milk', unitPrice: 525, totalPrice: 525 })]
      })
    );
  });

  it('renders returned receipts on the records page', async () => {
    mockFetch((path) => {
      if (path === '/api/auth/me') return { user: member, csrfToken: 'csrf-current' };
      if (path.startsWith('/api/receipts')) {
        return {
          receipts: [
            {
              id: 'receipt_1',
              merchant: 'Corner Market',
              purchaseDate: '2026-05-12',
              currency: 'USD',
              subtotal: 1299,
              tax: 101,
              discount: 0,
              total: 1400,
              categoryId: 'cat_builtin_groceries',
              notes: null,
              sourceType: 'receipt_image',
              createdAt: '2026-05-12T12:00:00.000Z',
              updatedAt: '2026-05-12T12:00:00.000Z'
            }
          ]
        };
      }
      return { ok: true };
    });
    window.location.hash = '#records';

    render(<App />);

    expect(await screen.findByRole('heading', { name: /records/i })).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'Corner Market' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '$14.00' })).toBeInTheDocument();
  });

  it('calls category, budget, and admin user APIs from settings pages', async () => {
    const fetchMock = mockFetch((path, init) => {
      const method = init?.method ?? 'GET';
      if (path === '/api/auth/me') return { user: admin, csrfToken: 'csrf-admin' };
      if (path === '/api/categories' && method === 'GET') return { categories };
      if (path.startsWith('/api/budgets?month=')) return { budgets: [] };
      if (path === '/api/users') return { users: [admin] };
      return { ok: true };
    });

    render(<App />);

    await userEvent.click((await screen.findAllByRole('link', { name: /categories/i }))[0]);
    expect(await screen.findByRole('heading', { name: /categories/i })).toBeInTheDocument();
    expect(await screen.findByText('Groceries')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('link', { name: /budgets/i })[0]);
    expect(await screen.findByRole('heading', { name: /budgets/i })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('link', { name: /admin users/i })[0]);
    expect(await screen.findByRole('heading', { name: /admin users/i })).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'admin' })).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith('/api/categories', expect.objectContaining({ method: 'GET' }));
    expect(fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/budgets?month='))).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/users', expect.objectContaining({ method: 'GET' }));
  });
});
