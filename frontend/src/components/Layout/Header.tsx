import { useState, useRef, useEffect } from 'react';
import { Menu, Building2, LogOut, Smartphone, Monitor } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  viewMode?: 'desktop' | 'mobile';
  onToggleViewMode?: () => void;
}

export default function Header({ title, onMenuClick, viewMode = 'desktop', onToggleViewMode }: HeaderProps) {
  const { user, tenant, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <header className="app-header">
      <button
        className="btn-ghost btn-icon mobile-menu-btn"
        onClick={onMenuClick}
        style={{ marginRight: 'var(--space-md)' }}
      >
        <Menu size={22} />
      </button>

      <h1 style={{ fontSize: '1.125rem', fontWeight: 700, flex: 1 }}>{title}</h1>

      {onToggleViewMode && (
        <button
          onClick={onToggleViewMode}
          title={viewMode === 'mobile' ? 'Modo desktop' : 'Modo celular'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            marginRight: 8,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: viewMode === 'mobile' ? 'var(--color-accent-muted)' : 'transparent',
            color: viewMode === 'mobile' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 150ms',
            whiteSpace: 'nowrap',
          }}
        >
          {viewMode === 'mobile' ? <Monitor size={15} /> : <Smartphone size={15} />}
          <span className="view-mode-label">
            {viewMode === 'mobile' ? 'Modo desktop' : 'Modo celular'}
          </span>
        </button>
      )}

      {user && (
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-accent-muted)',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {(user.first_name || user.username || 'U')[0].toUpperCase()}
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 0.5rem)',
              right: 0,
              minWidth: '13rem',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              zIndex: 100,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
              }}>
                Empresa
              </div>

              <NavLink
                to="/settings/company"
                onClick={() => setMenuOpen(false)}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.875rem',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
                  background: isActive ? 'var(--color-accent-muted)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                })}
              >
                <Building2 size={16} />
                <span>{tenant?.name || 'Configurações'}</span>
              </NavLink>

              <div style={{ height: '1px', background: 'var(--color-border)', margin: '0.25rem 0' }} />

              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.875rem',
                  color: 'var(--color-text)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover, rgba(255,255,255,0.05))')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <LogOut size={16} />
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        .mobile-menu-btn { display: none; }
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex; }
          .view-mode-label { display: none; }
        }
      `}</style>
    </header>
  );
}
