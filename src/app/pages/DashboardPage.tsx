import { BarChart3, FilePlus2, ReceiptText } from 'lucide-react';
import { Button } from '../components/Button';

export function DashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <section className="dashboard-page" aria-labelledby="dashboard-heading">
      <div className="page-header">
        <div>
          <p className="eyebrow">Current month</p>
          <h1 id="dashboard-heading">Dashboard</h1>
        </div>
        <div className="header-actions">
          <Button icon={<FilePlus2 size={16} />} onClick={() => onNavigate('upload')} variant="primary">
            Upload receipt
          </Button>
          <Button icon={<BarChart3 size={16} />} onClick={() => onNavigate('reports')}>
            Generate report
          </Button>
        </div>
      </div>

      <div className="summary-grid">
        <article className="summary-panel total-panel">
          <span className="summary-label">This month total</span>
          <strong>$0.00</strong>
          <span className="summary-note">Receipts will update this total as records are added.</span>
        </article>
        <article className="summary-panel">
          <span className="summary-label">Recent records</span>
          <strong>0</strong>
          <span className="summary-note">No purchases recorded yet this month.</span>
        </article>
        <article className="summary-panel">
          <span className="summary-label">Report status</span>
          <strong>Ready</strong>
          <span className="summary-note">Generate a monthly summary when records are available.</span>
        </article>
      </div>

      <section className="records-preview" aria-labelledby="recent-records-heading">
        <div className="section-heading">
          <ReceiptText size={18} />
          <h2 id="recent-records-heading">Recent records</h2>
        </div>
        <div className="empty-state">
          <p>No receipt records yet. Upload a receipt or add a manual record to begin.</p>
        </div>
      </section>
    </section>
  );
}
