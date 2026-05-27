import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ReceiptDetailPage } from './pages/ReceiptDetailPage';
import { RecordsPage } from './pages/RecordsPage';
import { ReportPage } from './pages/ReportPage';
import { UploadPage } from './pages/UploadPage';
import { AuthProvider, useAuth } from './state/auth';

const pageTitles: Record<string, string> = {
  upload: 'Upload',
  records: 'Records',
  reports: 'Reports',
  categories: 'Categories',
  budgets: 'Budgets',
  settings: 'Settings',
  'admin-users': 'Admin Users'
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { loading, user } = useAuth();
  const [currentPage, setCurrentPage] = useState(() => pageFromHash());

  useEffect(() => {
    function handleHashChange() {
      setCurrentPage(pageFromHash());
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function navigate(page: string) {
    window.location.hash = page;
    setCurrentPage(page);
  }

  if (loading) {
    return (
      <main className="loading-page">
        <p>Loading MyPurchase</p>
      </main>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <Layout currentPage={currentPage} onNavigate={navigate}>
      <PageRoute currentPage={currentPage} onNavigate={navigate} />
    </Layout>
  );
}

function PageRoute({ currentPage, onNavigate }: { currentPage: string; onNavigate: (page: string) => void }) {
  if (currentPage === 'dashboard') return <DashboardPage onNavigate={onNavigate} />;
  if (currentPage === 'upload') return <UploadPage onNavigate={onNavigate} />;
  if (currentPage === 'records') return <RecordsPage onNavigate={onNavigate} />;
  if (currentPage === 'reports') return <ReportPage />;
  if (currentPage.startsWith('receipt/')) return <ReceiptDetailPage receiptId={currentPage.slice('receipt/'.length)} />;
  if (currentPage === 'categories') return <CategoriesPage />;
  if (currentPage === 'budgets') return <BudgetsPage />;
  if (currentPage === 'admin-users') return <AdminUsersPage />;
  return <PlaceholderPage page={currentPage} />;
}

function PlaceholderPage({ page }: { page: string }) {
  const title = pageTitles[page] ?? 'Dashboard';
  return (
    <section className="placeholder-page" aria-labelledby="placeholder-heading">
      <p className="eyebrow">Workspace</p>
      <h1 id="placeholder-heading">{title}</h1>
      <p>This area is ready for the next task.</p>
    </section>
  );
}

function pageFromHash() {
  const page = window.location.hash.replace('#', '');
  return page || 'dashboard';
}
