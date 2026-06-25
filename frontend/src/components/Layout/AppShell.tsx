import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transações',
  '/accounts': 'Contas',
  '/categories': 'Categorias',
  '/invoices': 'Faturas',
  '/shopping': 'Compras',
  '/investments': 'Investimentos',
  '/settings/company': 'Empresa',
};

type ViewMode = 'desktop' | 'mobile';

function readViewMode(): ViewMode {
  try { return (localStorage.getItem('view-mode') as ViewMode) || 'desktop'; } catch { return 'desktop'; }
}

function readCollapsed(): boolean {
  try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  const location = useLocation();

  const title = pageTitles[location.pathname] || 'Nexo';
  const isMobile = viewMode === 'mobile';

  const toggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const toggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'desktop' ? 'mobile' : 'desktop';
      try { localStorage.setItem('view-mode', next); } catch {}
      return next;
    });
  };

  return (
    <div className={`app-layout${isMobile ? ' mobile-preview' : ''}`}>
      {!isMobile && (
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      )}
      <div className={`app-main${sidebarCollapsed && !isMobile ? ' collapsed' : ''}`}>
        <Header
          title={title}
          onMenuClick={() => setSidebarOpen((prev) => !prev)}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
        />
        <main className="app-content animate-fade-in" key={location.pathname}>
          <Outlet />
        </main>
        {isMobile && <BottomNav />}
      </div>
    </div>
  );
}
