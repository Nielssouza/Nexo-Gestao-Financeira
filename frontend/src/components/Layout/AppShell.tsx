import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

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

function readCollapsed(): boolean {
  try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
  const location = useLocation();

  const title = pageTitles[location.pathname] || 'Nexo';

  const toggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div className={`app-main${sidebarCollapsed ? ' collapsed' : ''}`}>
        <Header title={title} onMenuClick={() => setSidebarOpen((prev) => !prev)} />
        <main className="app-content animate-fade-in" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
