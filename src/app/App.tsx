import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
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
      {currentPage === 'dashboard' ? <DashboardPage onNavigate={navigate} /> : <PlaceholderPage page={currentPage} />}
    </Layout>
  );
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
