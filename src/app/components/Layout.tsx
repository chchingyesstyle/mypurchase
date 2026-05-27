import {
  BarChart3,
  FilePlus2,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Settings,
  Tags,
  Users,
  WalletCards
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useAuth } from '../state/auth';
import { Button } from './Button';

type NavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload', icon: FilePlus2 },
  { id: 'records', label: 'Records', icon: ReceiptText },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'budgets', label: 'Budgets', icon: WalletCards },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'admin-users', label: 'Admin Users', icon: Users, adminOnly: true }
];

export function Layout({
  children,
  currentPage,
  onNavigate
}: {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}) {
  const { logout, user } = useAuth();
  const visibleItems = navItems.filter((item) => !item.adminOnly || user?.role === 'admin');

  return (
    <div className="product-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <FolderOpen size={20} />
          <span>MyPurchase</span>
        </div>
        <nav aria-label="Primary" className="desktop-nav">
          {visibleItems.map((item) => (
            <NavLink currentPage={currentPage} item={item} key={item.id} onNavigate={onNavigate} />
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>{user?.username}</span>
          <Button icon={<LogOut size={16} />} onClick={logout} variant="ghost">
            Sign out
          </Button>
        </div>
      </aside>
      <header className="mobile-header">
        <div className="brand-lockup">
          <FolderOpen size={20} />
          <span>MyPurchase</span>
        </div>
        <Button icon={<LogOut size={16} />} onClick={logout} variant="ghost">
          Sign out
        </Button>
      </header>
      <nav aria-label="Primary" className="mobile-nav">
        {visibleItems.map((item) => (
          <NavLink compact currentPage={currentPage} item={item} key={item.id} onNavigate={onNavigate} />
        ))}
      </nav>
      <main className="content-shell">{children}</main>
    </div>
  );
}

function NavLink({
  compact = false,
  currentPage,
  item,
  onNavigate
}: {
  compact?: boolean;
  currentPage: string;
  item: NavItem;
  onNavigate: (page: string) => void;
}) {
  const Icon = item.icon;
  const isActive = currentPage === item.id;

  return (
    <a
      aria-current={isActive ? 'page' : undefined}
      className={isActive ? 'nav-link active' : 'nav-link'}
      href={`#${item.id}`}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(item.id);
      }}
    >
      <Icon size={compact ? 17 : 18} />
      <span>{item.label}</span>
    </a>
  );
}
