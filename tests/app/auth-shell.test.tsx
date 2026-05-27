import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { apiRequest, setCsrfToken } from '../../src/app/api/client';
import type { User } from '../../src/shared/types';

const user: User = {
  id: 'user_1',
  username: 'member',
  role: 'user',
  defaultCurrency: 'USD',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

const admin: User = {
  ...user,
  id: 'user_admin',
  username: 'admin',
  role: 'admin'
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('authenticated frontend shell', () => {
  beforeEach(() => {
    window.location.hash = '';
    setCsrfToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the login screen to unauthenticated users', async () => {
    mockFetch(jsonResponse({ error: 'Authentication required' }, 401));

    render(<App />);

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
  });

  it('posts username and password from the login form', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ error: 'Authentication required' }, 401),
      jsonResponse({ user, csrfToken: 'csrf-login' })
    );

    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), 'member');
    await userEvent.type(screen.getByLabelText(/password/i), 'member-secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ username: 'member', password: 'member-secret' })
      })
    );
  });

  it('shows dashboard navigation to authenticated users', async () => {
    mockFetch(jsonResponse({ user, csrfToken: 'csrf-current' }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: /primary/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /records/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /reports/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /upload receipt/i })).toBeInTheDocument();
  });

  it('shows the admin navigation item to admin users', async () => {
    mockFetch(jsonResponse({ user: admin, csrfToken: 'csrf-admin' }));

    render(<App />);

    await waitFor(() => expect(screen.getAllByRole('link', { name: /admin users/i }).length).toBeGreaterThan(0));
  });

  it('sends the CSRF token on mutating API calls', async () => {
    const fetchMock = mockFetch(jsonResponse({ ok: true }));
    setCsrfToken('csrf-known');

    await apiRequest('/api/receipts', {
      method: 'POST',
      body: { merchant: 'Grocery', total: 12.34 }
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-csrf-token')).toBe('csrf-known');
  });
});
