import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../api/client';
import { AdviceBlock, type ReportAdvice } from '../components/AdviceBlock';
import { ReportCharts, type MonthlyReportSummary } from '../components/ReportCharts';
import { Button } from '../components/Button';
import { localMonthInputValue } from '../utils/localDate';
import { formatMoney } from './RecordsPage';

type MonthlyReport = {
  id: string | null;
  userId: string;
  month: string;
  summary: MonthlyReportSummary;
  advice: ReportAdvice | null;
  recordsVersion: number;
  aiStatus: 'ready' | 'failed';
  createdAt: string | null;
  updatedAt: string | null;
};

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

export function ReportPage() {
  const [month, setMonth] = useState(localMonthInputValue());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState('loading');
    setError(null);
    setReport(null);

    apiRequest<{ report: MonthlyReport }>(`/api/reports/${encodeURIComponent(month)}`)
      .then((response) => {
        if (!active) return;
        setReport(response.report);
        setState('ready');
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        if (loadError instanceof ApiError && loadError.status === 404) {
          setState('missing');
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Report could not be loaded.');
        setState('error');
      });

    return () => {
      active = false;
    };
  }, [month]);

  async function generateReport() {
    setGenerating(true);
    setError(null);
    try {
      const response = await apiRequest<{ report: MonthlyReport }>(`/api/reports/${encodeURIComponent(month)}/generate`, { method: 'POST' });
      setReport(response.report);
      setState('ready');
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Report could not be generated.');
      setState(report ? 'ready' : 'error');
    } finally {
      setGenerating(false);
    }
  }

  const summary = report?.summary;
  const currency = summary?.totals.currency ?? 'USD';

  return (
    <section className="workspace-page report-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1 id="report-heading">Monthly report</h1>
        </div>
        <div className="header-actions report-actions">
          <label>
            <span>Month</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          {state !== 'missing' ? (
            <Button disabled={generating || state === 'loading'} icon={<RefreshCw size={16} />} onClick={generateReport} variant="primary">
              {report ? 'Regenerate report' : 'Generate report'}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {state === 'loading' ? <ReportLoading /> : null}

      {state === 'missing' ? (
        <section className="report-panel report-empty">
          <h2>No cached report</h2>
          <p>Generate a report for {month} to summarize current records, budget usage, recurring purchases, and advice.</p>
          <Button disabled={generating} icon={<RefreshCw size={16} />} onClick={generateReport} variant="primary">
            {generating ? 'Generating report' : 'Generate report'}
          </Button>
        </section>
      ) : null}

      {summary ? (
        <>
          <div className="report-summary-grid">
            <SummaryCard label="Total spend" value={formatMoney(summary.totals.total, currency)} note={`${summary.totals.receiptCount} ${plural(summary.totals.receiptCount, 'receipt')}`} emphasis />
            <SummaryCard label="Items" value={String(summary.totals.itemCount)} note={`${formatMoney(summary.totals.subtotal, currency)} subtotal`} />
            <SummaryCard label="Tax" value={formatMoney(summary.totals.tax, currency)} note={`${formatMoney(summary.totals.discount, currency)} discounts`} />
            <SummaryCard label="Report state" value={report.aiStatus === 'failed' ? 'AI failed' : 'Ready'} note={`Records version ${report.recordsVersion}`} />
          </div>

          <div className="report-grid">
            <ReportCharts summary={summary} />
          </div>

          <AdviceBlock advice={report.advice} aiStatus={report.aiStatus} />
        </>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value, note, emphasis = false }: { label: string; value: string; note: string; emphasis?: boolean }) {
  return (
    <article className={`summary-panel report-summary-card${emphasis ? ' total-panel' : ''}`}>
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
      <span className="summary-note">{note}</span>
    </article>
  );
}

function ReportLoading() {
  return (
    <section className="report-panel report-loading" aria-label="Loading report">
      <span />
      <span />
      <span />
    </section>
  );
}

function plural(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}
