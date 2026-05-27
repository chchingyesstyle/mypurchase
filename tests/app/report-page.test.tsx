import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { setCsrfToken } from '../../src/app/api/client';
import type { User } from '../../src/shared/types';

const user: User = {
  id: 'user_1',
  username: 'member',
  role: 'user',
  defaultCurrency: 'USD',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

type MockReport = Record<string, any>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function mockFetch(handler: (path: string, init: RequestInit | undefined) => Response | unknown) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = input instanceof Request ? input.url : String(input);
    const body = handler(path, init);
    return body instanceof Response ? body : jsonResponse(body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function reportBody(overrides: Partial<MockReport> = {}) {
  const report = {
    id: 'report_1',
    userId: user.id,
    month: '2026-05',
    recordsVersion: 4,
    aiStatus: 'ready' as const,
    createdAt: '2026-05-27T12:00:00.000Z',
    updatedAt: '2026-05-27T12:00:00.000Z',
    summary: {
      totals: {
        total: 12875,
        subtotal: 11900,
        tax: 975,
        discount: 0,
        receiptCount: 4,
        itemCount: 8,
        currency: 'USD'
      },
      categoryTotals: [
        { categoryId: 'cat_groceries', total: 8200, receiptCount: 3, itemTotal: 6100 },
        { categoryId: null, total: 4675, receiptCount: 1, itemTotal: 2100 }
      ],
      merchantTotals: [
        { merchant: 'Corner Market', total: 6200, receiptCount: 2 },
        { merchant: 'Metro Pharmacy', total: 4675, receiptCount: 1 }
      ],
      itemTotals: [
        { normalizedName: 'oat milk', name: 'Oat Milk', total: 1098, quantity: 2, count: 2, categoryId: 'cat_groceries' },
        { normalizedName: 'paper towels', name: 'Paper Towels', total: 899, quantity: 1, count: 1, categoryId: null }
      ],
      recurringItemCandidates: [
        { normalizedName: 'oat milk', name: 'Oat Milk', count: 2, total: 1098, merchants: ['Corner Market', 'Metro Pharmacy'] }
      ],
      unusualIncreases: [
        { type: 'merchant' as const, merchant: 'Metro Pharmacy', currentTotal: 4675, previousTotal: 1500, increase: 3175 }
      ],
      budgetStatus: [
        {
          categoryId: 'cat_groceries',
          currency: 'USD',
          amount: 10000,
          spent: 8200,
          remaining: 1800,
          percentUsed: 82,
          status: 'near' as const
        }
      ],
      previousMonthComparisons: {
        month: '2026-04',
        total: 9200,
        delta: 3675,
        percentChange: 40,
        categoryTotals: [{ categoryId: 'cat_groceries', currentTotal: 8200, previousTotal: 7000, delta: 1200 }],
        merchantTotals: [{ merchant: 'Corner Market', currentTotal: 6200, previousTotal: 5200, delta: 1000 }]
      }
    },
    advice: {
      overview: 'Your essentials are clustered around two merchants.',
      savingOpportunities: ['Move pantry restocks to one trip and save about $12.00.'],
      budgetWarnings: ['Groceries used 82% of the budget with $18.00 remaining.'],
      recurringNotes: ['Oat Milk repeated 2 times for $10.98.'],
      itemInsights: ['Metro Pharmacy is up $31.75 from last month.'],
      nextMonthSuggestions: ['Keep groceries steady before adding new recurring items.']
    },
    ...overrides
  };
  return { report };
}

function authenticatedReportsFetch(options: {
  getResponse?: Response | unknown;
  generateResponse?: Response | unknown;
  onGenerate?: (path: string, init: RequestInit | undefined) => void;
} = {}) {
  return mockFetch((path, init) => {
    const method = init?.method ?? 'GET';
    if (path === '/api/auth/me') return { user, csrfToken: 'csrf-current' };
    if (path.startsWith('/api/reports/') && path.endsWith('/generate') && method === 'POST') {
      options.onGenerate?.(path, init);
      return options.generateResponse ?? reportBody();
    }
    if (path.startsWith('/api/reports/') && method === 'GET') return options.getResponse ?? reportBody();
    return { ok: true };
  });
}

describe('monthly report page', () => {
  beforeEach(() => {
    window.location.hash = '#reports';
    setCsrfToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads a cached report from GET /api/reports/:month', async () => {
    const fetchMock = authenticatedReportsFetch();

    render(<App />);

    expect(await screen.findByRole('heading', { name: /monthly report/i })).toBeInTheDocument();
    expect(await screen.findByText('$128.75')).toBeInTheDocument();
    expect(screen.getByText('Corner Market')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([path, init]) => String(path).startsWith('/api/reports/') && init?.method === 'GET')).toBe(true);
  });

  it('generate button calls POST /api/reports/:month/generate', async () => {
    let generatedPath = '';
    authenticatedReportsFetch({
      getResponse: jsonResponse({ error: 'Report not found' }, 404),
      generateResponse: reportBody({ id: 'report_generated' }),
      onGenerate: (path) => {
        generatedPath = path;
      }
    });

    render(<App />);

    await screen.findByText(/no cached report/i);
    await userEvent.click(screen.getByRole('button', { name: /generate report/i }));

    await waitFor(() => expect(generatedPath).toMatch(/^\/api\/reports\/\d{4}-\d{2}\/generate$/));
    expect(await screen.findByText('$128.75')).toBeInTheDocument();
  });

  it('renders deterministic totals when aiStatus is failed', async () => {
    authenticatedReportsFetch({
      getResponse: reportBody({ aiStatus: 'failed', advice: null, id: null, createdAt: null, updatedAt: null } as Partial<MockReport>)
    });

    render(<App />);

    expect(await screen.findByText('$128.75')).toBeInTheDocument();
    expect(screen.getByText('4 receipts')).toBeInTheDocument();
    expect(screen.getByText(/AI advice unavailable/i)).toBeInTheDocument();
  });

  it('renders advice sections when present', async () => {
    authenticatedReportsFetch();

    render(<App />);

    expect(await screen.findByText(/essentials are clustered/i)).toBeInTheDocument();
    expect(screen.getByText(/save about \$12\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/82% of the budget/i)).toBeInTheDocument();
    expect(screen.getByText(/2 times for \$10\.98/i)).toBeInTheDocument();
    expect(screen.getByText(/up \$31\.75/i)).toBeInTheDocument();
  });

  it('month selector uses YYYY-MM', async () => {
    authenticatedReportsFetch();

    render(<App />);

    const monthInput = await screen.findByLabelText(/month/i);
    expect(monthInput).toHaveAttribute('type', 'month');
    expect((monthInput as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}$/);
  });

  it('GET 404 shows a state that lets the user generate', async () => {
    authenticatedReportsFetch({ getResponse: jsonResponse({ error: 'Report not found' }, 404) });

    render(<App />);

    expect(await screen.findByText(/no cached report/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate report/i })).toBeEnabled();
  });

  it('generated report uses the returned report body, not a stale local placeholder', async () => {
    authenticatedReportsFetch({
      getResponse: jsonResponse({ error: 'Report not found' }, 404),
      generateResponse: reportBody({
        id: 'report_generated',
        summary: {
          ...reportBody().report.summary,
          totals: { ...reportBody().report.summary.totals, total: 2442, receiptCount: 1 },
          merchantTotals: [{ merchant: 'Generated Deli', total: 2442, receiptCount: 1 }]
        },
        advice: {
          ...reportBody().report.advice,
          overview: 'The generated response should replace the empty state.',
          savingOpportunities: ['Generated Deli has $24.42 in spend to review.']
        }
      })
    });

    render(<App />);

    await screen.findByText(/no cached report/i);
    await userEvent.click(screen.getByRole('button', { name: /generate report/i }));

    expect((await screen.findAllByText('$24.42')).length).toBeGreaterThan(0);
    expect(screen.getByText('Generated Deli')).toBeInTheDocument();
    expect(within(screen.getByLabelText(/ai advice/i)).getByText(/generated response should replace/i)).toBeInTheDocument();
    expect(screen.queryByText('$128.75')).not.toBeInTheDocument();
  });
});
