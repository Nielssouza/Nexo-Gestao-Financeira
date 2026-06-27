import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import { ViewModeContext, type ViewMode } from '../../contexts/ViewModeContext';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Financeiro',
  '/transactions/new': 'Nova Transação',
  '/accounts': 'Contas',
  '/categories': 'Categorias',
  '/invoices': 'Faturas',
  '/shopping': 'Compras',
  '/investments': 'Investimentos',
  '/settings/company': 'Empresa',
  '/admin': 'Administração',
};

function readViewMode(): ViewMode {
  try { return (localStorage.getItem('view-mode') as ViewMode) || 'desktop'; } catch { return 'desktop'; }
}

function readCollapsed(): boolean {
  try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
}

function useIsSmallScreen(): boolean {
  const [small, setSmall] = useState(() => window.innerWidth < 769);
  useEffect(() => {
    const handler = () => setSmall(window.innerWidth < 769);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return small;
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  const location = useLocation();
  const isSmallScreen = useIsSmallScreen();

  const title = pageTitles[location.pathname] || 'Nexo';
  const isMobile = viewMode === 'mobile' || isSmallScreen;
  const isPreviewFrame = viewMode === 'mobile' && !isSmallScreen;

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
    <ViewModeContext.Provider value={{ viewMode, isMobile, toggle: toggleViewMode }}>
      <div className={`app-layout${isPreviewFrame ? ' mobile-preview' : ''}`}>
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
            isMobile={isMobile}
          />
          <main className="app-content animate-fade-in" key={location.pathname}>
            <Outlet />
          </main>
          <BottomNav />
        </div>
      </div>
    </ViewModeContext.Provider>
  );
}
