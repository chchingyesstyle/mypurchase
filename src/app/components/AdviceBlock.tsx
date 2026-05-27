import { AlertTriangle, CheckCircle2, Lightbulb, Repeat2, TrendingUp } from 'lucide-react';

export type ReportAdvice = {
  overview: string;
  savingOpportunities: string[];
  budgetWarnings: string[];
  recurringNotes: string[];
  itemInsights: string[];
  nextMonthSuggestions: string[];
};

type AdviceBlockProps = {
  advice: ReportAdvice | null;
  aiStatus: string;
};

const sections = [
  { key: 'savingOpportunities', title: 'Savings', icon: Lightbulb },
  { key: 'budgetWarnings', title: 'Budget warnings', icon: AlertTriangle },
  { key: 'recurringNotes', title: 'Recurring', icon: Repeat2 },
  { key: 'itemInsights', title: 'Item insights', icon: TrendingUp },
  { key: 'nextMonthSuggestions', title: 'Next month', icon: CheckCircle2 }
] as const;

export function AdviceBlock({ advice, aiStatus }: AdviceBlockProps) {
  if (!advice || aiStatus === 'failed') {
    return (
      <section className="report-panel advice-panel" aria-label="AI advice">
        <div className="section-heading">
          <AlertTriangle size={17} />
          <h2>AI advice</h2>
        </div>
        <p className="muted-copy">AI advice unavailable. Deterministic totals and breakdowns are still current for this month.</p>
      </section>
    );
  }

  return (
    <section className="report-panel advice-panel" aria-label="AI advice">
      <div className="section-heading split-heading">
        <span className="heading-with-icon">
          <CheckCircle2 size={17} />
          <h2>AI advice</h2>
        </span>
        <span className="status-pill">Ready</span>
      </div>
      <div className="advice-lead">
        <p>{advice.overview}</p>
      </div>
      <div className="advice-grid">
        {sections.map(({ key, title, icon: Icon }) => {
          const items = advice[key] ?? [];
          if (items.length === 0) return null;
          return (
            <article className="advice-section" key={key}>
              <div className="advice-section-title">
                <Icon size={15} />
                <h3>{title}</h3>
                <span>{items.length}</span>
              </div>
              <ol className="advice-list">
                {items.map((item, index) => (
                  <li key={`${key}-${item}`}>
                    <span>{index + 1}</span>
                    <p>{item}</p>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>
    </section>
  );
}
