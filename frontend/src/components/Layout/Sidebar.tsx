import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileText,
  ShoppingCart,
  TrendingUp,
  Settings,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  CheckSquare,
  StickyNote,
  CloudUpload,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Financeiro' },
  { to: '/investments', icon: TrendingUp, label: 'Investimentos' },
  { to: '/invoices', icon: FileText, label: 'Fatura de Serviços' },
  { to: '/shopping', icon: ShoppingCart, label: 'Lista de Compras' },
  { to: '/todos', icon: CheckSquare, label: 'Tarefas' },
  { to: '/notes', icon: StickyNote, label: 'Anotações' },
  { to: '/drive', icon: CloudUpload, label: 'Drive' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const { user, tenant } = useAuth();
  const canManageTenantSettings = Boolean(user?.is_superuser || tenant?.role === 'owner' || tenant?.role === 'admin');
  const canManageSystem = Boolean(user?.is_superuser);
  const items = [
    ...navItems,
    ...(canManageTenantSettings ? [{ to: '/settings/company', icon: Settings, label: 'Configurações' }] : []),
    ...(canManageSystem ? [{ to: '/admin', icon: ShieldCheck, label: 'Administração' }] : []),
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 39,
            display: 'none',
          }}
        />
      )}

      <aside className={`app-sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="nav-brand">
          <span className="nav-brand-text">Nexo</span>
          <button
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="nav-section" style={{ flex: 1 }}>
          {!collapsed && <div className="nav-section-title">Menu</div>}
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard' || to === '/admin' || to === '/settings/company'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
              title={collapsed ? label : undefined}
            >
              <Icon className="icon" size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
