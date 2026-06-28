import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Menu, Building2, ChevronDown, LogOut } from 'lucide-react';
import { fetchTenantCompanies } from '../../api/tenant';
import { fetchAllCompanies, type AllCompanyItem } from '../../api/system';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  isMobile?: boolean;
}

const ACTIVE_COMPANY_STORAGE_KEY = 'nexo.activeCompanyId';
const ACTIVE_TENANT_STORAGE_KEY = 'nexo.activeTenantId';

type HeaderCompany = {
  id: number;
  name: string;
  tenant?: number;
  tenant_id?: number;
  is_default?: boolean;
};

function getCompanyTenantId(company: HeaderCompany | null | undefined) {
  return company?.tenant_id || company?.tenant || null;
}

export default function Header({ title, onMenuClick, isMobile = false }: HeaderProps) {
  const { user, tenant, logout, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(() => {
    try {
      const value = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
      return value ? Number(value) : null;
    } catch {
      return null;
    }
  });
  const [activeTenantId, setActiveTenantId] = useState<number | null>(() => {
    try {
      const value = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
      return value ? Number(value) : null;
    } catch {
      return null;
    }
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const tenantMenuRef = useRef<HTMLDivElement>(null);
  const tenantLabel = tenant?.person_type === 'pf' ? 'Pessoa' : 'Empresa';
  const tenantTitle = tenant?.name ? `${tenantLabel}: ${tenant.name}` : `${tenantLabel} atual`;
  const isSuperuser = Boolean(user?.is_superuser);
  const [tenantScopeReady, setTenantScopeReady] = useState(false);

  const { data: tenantCompanies = [] } = useQuery({
    queryKey: ['tenantCompanies', tenant?.id],
    queryFn: fetchTenantCompanies,
    enabled: Boolean(user) && !isSuperuser && tenantScopeReady,
  });

  const { data: allCompanies = [] } = useQuery({
    queryKey: ['allCompanies'],
    queryFn: fetchAllCompanies,
    enabled: isSuperuser,
  });

  // Group all companies by tenant for superuser view
  const allCompaniesByTenant: { tenant_name: string; tenant_code: string; companies: AllCompanyItem[] }[] = isSuperuser
    ? Object.values(
        allCompanies.reduce<Record<number, { tenant_name: string; tenant_code: string; companies: AllCompanyItem[] }>>(
          (acc, c) => {
            if (!acc[c.tenant_id]) {
              acc[c.tenant_id] = {
                tenant_name: c.tenant_name,
                tenant_code: c.tenant_code || String(c.tenant_id),
                companies: [],
              };
            }
            acc[c.tenant_id].companies.push(c);
            return acc;
          },
          {}
        )
      ).sort((a, b) => a.tenant_code.localeCompare(b.tenant_code, 'pt-BR', { numeric: true }))
    : [];
  const userDisplayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || user.username
    : '';

  function formatDocument(value?: string) {
    const digits = (value || '').replace(/\D/g, '');
    if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return value || '';
  }

  function displayName(name: string) {
    if (!name) return name;
    const workspaceSuffix = ' Workspace';
    if (name.endsWith(workspaceSuffix) && name.includes('@')) {
      return name.slice(0, -workspaceSuffix.length);
    }
    return name;
  }

  function roleLabel(role?: string | null) {
    if (user?.is_superuser) return 'Superadmin';
    if (role === 'owner') return 'Owner';
    if (role === 'admin') return 'Admin';
    if (role === 'member') return 'Membro';
    return 'Sem nível';
  }

  function tenantCodeFromValue(value?: string) {
    if (!value) return tenant?.id ? `#${String(tenant.id).padStart(4, '0')}` : 'Não informado';
    if (/^\d{8}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return tenant?.id ? `#${String(tenant.id).padStart(4, '0')}` : 'Não informado';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}${month}${year}`;
  }

  const availableCompanies = isSuperuser ? allCompanies : tenantCompanies;
  const activeCompany =
    availableCompanies.find((company) => (
      company.id === activeCompanyId &&
      (!activeTenantId || getCompanyTenantId(company) === activeTenantId)
    )) ||
    availableCompanies.find((company) => company.is_default) ||
    availableCompanies[0];
  const activeCompanyName = displayName(activeCompany?.name || tenant?.name || 'Sem empresa');
  const tenantCode = isSuperuser
    ? tenantCodeFromValue(allCompanies.find((company) => getCompanyTenantId(company) === activeTenantId)?.tenant_code)
    : tenantCodeFromValue(tenant?.created_at);

  function selectCompany(company: HeaderCompany) {
    const tenantId = getCompanyTenantId(company) || tenant?.id || null;
    setActiveCompanyId(company.id);
    setActiveTenantId(tenantId);
    try {
      localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, String(company.id));
      if (tenantId) {
        localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, String(tenantId));
        localStorage.setItem(`nexo.activeCompanyId.${tenantId}`, String(company.id));
      }
    } catch {}
    window.dispatchEvent(new CustomEvent('nexo:company-change', { detail: { companyId: company.id, tenantId } }));
    setTenantMenuOpen(false);
    queryClient.invalidateQueries();
    void refresh();
  }

  useEffect(() => {
    if (!user) {
      setTenantScopeReady(false);
      return;
    }
    if (isSuperuser) {
      setTenantScopeReady(true);
      return;
    }
    if (!tenant?.id) {
      setTenantScopeReady(false);
      return;
    }
    try {
      localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, String(tenant.id));
      setActiveTenantId(tenant.id);
      const storedCompanyId = localStorage.getItem(`nexo.activeCompanyId.${tenant.id}`);
      if (storedCompanyId) {
        localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, storedCompanyId);
        setActiveCompanyId(Number(storedCompanyId));
      }
    } catch {}
    setTenantScopeReady(true);
  }, [isSuperuser, tenant?.id, user]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tenantMenuRef.current && !tenantMenuRef.current.contains(e.target as Node)) {
        setTenantMenuOpen(false);
      }
    }
    if (tenantMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tenantMenuOpen]);

  useEffect(() => {
    if (availableCompanies.length === 0) return;
    if (activeCompanyId && availableCompanies.some((company) => (
      company.id === activeCompanyId &&
      (!activeTenantId || getCompanyTenantId(company) === activeTenantId)
    ))) return;

    const nextCompany = availableCompanies.find((company) => company.is_default) || availableCompanies[0];
    const nextTenantId = getCompanyTenantId(nextCompany);
    setActiveCompanyId(nextCompany.id);
    setActiveTenantId(nextTenantId);
    try {
      localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, String(nextCompany.id));
      if (nextTenantId) {
        localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, String(nextTenantId));
        localStorage.setItem(`nexo.activeCompanyId.${nextTenantId}`, String(nextCompany.id));
      }
    } catch {}
  }, [activeCompanyId, activeTenantId, availableCompanies, tenant?.id]);

  return (
    <header className="app-header">
      {!isMobile && (
        <button
          className="btn-ghost btn-icon mobile-menu-btn"
          onClick={onMenuClick}
          style={{ marginRight: 'var(--space-md)' }}
        >
          <Menu size={22} />
        </button>
      )}

      <h1 style={{ fontSize: '1.125rem', fontWeight: 700, flex: 1, minWidth: 0 }}>{title}</h1>

      {user && (
        <div ref={tenantMenuRef} style={{ position: 'relative', marginRight: '0.75rem' }}>
          <button
            type="button"
            className="tenant-indicator"
            title={tenantTitle}
            onClick={() => setTenantMenuOpen((v) => !v)}
          >
            <Building2 size={15} className="tenant-indicator-icon" />
            <span className="tenant-indicator-label">{tenantLabel}</span>
            <span className="tenant-indicator-name">{activeCompanyName}</span>
            <ChevronDown size={14} className="tenant-indicator-icon" />
          </button>

          {tenantMenuOpen && (
            <div className="tenant-dropdown">
              {isSuperuser ? (
                <>
                  <div className="tenant-dropdown-title">Todas as empresas</div>
                  {allCompaniesByTenant.length === 0 ? (
                    <div className="tenant-dropdown-empty">Nenhuma empresa cadastrada.</div>
                  ) : allCompaniesByTenant.map((group) => (
                    <div key={group.tenant_name}>
                      <div className="tenant-dropdown-group">
                        Tenant {group.tenant_code}
                      </div>
                      {group.companies.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          className={`tenant-dropdown-item ${
                            company.id === activeCompany?.id &&
                            getCompanyTenantId(company) === getCompanyTenantId(activeCompany)
                              ? 'active'
                              : ''
                          }`}
                          onClick={() => selectCompany(company)}
                        >
                          <div className="tenant-dropdown-main">
                            <span className="tenant-dropdown-seq">{company.sequence_number}</span>
                            <span className="tenant-dropdown-name">{displayName(company.name)}</span>
                            {company.is_default && <span className="tenant-dropdown-badge">Padrão</span>}
                          </div>
                          <div className="tenant-dropdown-doc">
                            {formatDocument(company.document) || 'CPF/CNPJ não informado'}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="tenant-dropdown-title">Empresas do tenant</div>
                  {tenantCompanies.length === 0 ? (
                    <div className="tenant-dropdown-empty">Nenhuma empresa disponivel.</div>
                  ) : tenantCompanies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      className={`tenant-dropdown-item ${
                        company.id === activeCompany?.id &&
                        getCompanyTenantId(company) === getCompanyTenantId(activeCompany)
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => selectCompany(company)}
                    >
                      <div className="tenant-dropdown-main">
                        <span className="tenant-dropdown-seq">{company.sequence_number}</span>
                        <span className="tenant-dropdown-name">{company.name}</span>
                        {company.is_default && <span className="tenant-dropdown-badge">Padrao</span>}
                      </div>
                      <div className="tenant-dropdown-doc">
                        {formatDocument(company.document) || 'CPF/CNPJ nao informado'}
                      </div>
                    </button>
                  ))}

                </>
              )}
            </div>
          )}
        </div>
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
              minWidth: '16rem',
              maxWidth: 'calc(100vw - 1.5rem)',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-hover)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
              zIndex: 100,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '0.4rem 0.72rem 0.25rem',
                fontSize: '0.64rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
              }}>
                Tenant {tenantCode}
              </div>

              <div style={{
                padding: '0.62rem 0.72rem',
                borderBottom: '1px solid var(--color-border)',
              }}>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.22rem',
                }}>
                  Usuário
                </div>
                <div style={{
                  fontSize: '0.82rem',
                  lineHeight: 1.25,
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  overflowWrap: 'anywhere',
                }}>
                  {userDisplayName}
                </div>
                {user.email && user.email !== userDisplayName && (
                  <div style={{
                    marginTop: '0.12rem',
                    fontSize: '0.72rem',
                    lineHeight: 1.2,
                    color: 'var(--color-text-muted)',
                    overflowWrap: 'anywhere',
                  }}>
                    {user.email}
                  </div>
                )}
                <div style={{ marginTop: '0.65rem' }}>
                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                    marginBottom: '0.22rem',
                  }}>
                    Empresa
                  </div>
                  <div style={{
                    fontSize: '0.82rem',
                    lineHeight: 1.25,
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                    overflowWrap: 'anywhere',
                  }}>
                    {activeCompanyName}
                  </div>
                </div>
                <div style={{ marginTop: '0.65rem' }}>
                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                    marginBottom: '0.28rem',
                  }}>
                    Nível de acesso
                  </div>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 22,
                    padding: '0 0.45rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-accent-muted)',
                    color: 'var(--color-accent)',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}>
                    {roleLabel(tenant?.role)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  width: '100%',
                  padding: '0.62rem 0.72rem',
                  fontSize: '0.82rem',
                  lineHeight: 1.25,
                  color: 'var(--color-text-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover, rgba(255,255,255,0.05))')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <LogOut size={15} />
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        .mobile-menu-btn { display: none; }
        .tenant-indicator {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          max-width: min(360px, 42vw);
          min-width: 0;
          height: 32px;
          padding: 0 0.65rem;
          margin-right: 0.75rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-full);
          background: rgba(255,255,255,0.035);
          color: var(--color-text-primary);
          text-decoration: none;
          font-size: 0.78rem;
          line-height: 1;
          cursor: pointer;
        }
        button.tenant-indicator {
          font-family: inherit;
        }
        .tenant-indicator-icon {
          flex: 0 0 auto;
          color: var(--color-text-secondary);
        }
        .tenant-indicator-label {
          flex: 0 0 auto;
          color: var(--color-text-muted);
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .tenant-indicator-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 700;
        }
        .tenant-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          width: min(320px, calc(100vw - 1.5rem));
          max-height: min(360px, calc(100vh - 5rem));
          overflow-y: auto;
          background: var(--color-bg-card);
          border: 1px solid var(--color-border-hover);
          border-radius: var(--radius-lg);
          box-shadow: 0 12px 30px rgba(0,0,0,0.6);
          z-index: 100;
          padding: 0.35rem;
        }
        .tenant-dropdown-title {
          padding: 0.45rem 0.55rem 0.35rem;
          color: var(--color-text-muted);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .tenant-dropdown-group {
          padding: 0.5rem 0.55rem 0.2rem;
          color: var(--color-accent);
          font-size: 0.66rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          border-top: 1px solid var(--color-border);
          margin-top: 0.25rem;
        }
        .tenant-dropdown-group:first-child {
          border-top: none;
          margin-top: 0;
        }
        .tenant-dropdown-item {
          display: block;
          width: 100%;
          padding: 0.55rem;
          border: none;
          border-radius: var(--radius-md);
          background: none;
          color: var(--color-text-primary);
          font-family: inherit;
          text-align: left;
          cursor: pointer;
        }
        .tenant-dropdown-item + .tenant-dropdown-item {
          margin-top: 0.1rem;
        }
        .tenant-dropdown-item:hover {
          background: rgba(255,255,255,0.055);
        }
        .tenant-dropdown-item.active {
          background: rgba(255,255,255,0.09);
        }
        .tenant-dropdown-main {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          min-width: 0;
        }
        .tenant-dropdown-seq {
          flex: 0 0 auto;
          color: var(--color-text-muted);
          font-size: 0.72rem;
          font-weight: 800;
        }
        .tenant-dropdown-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.84rem;
          font-weight: 800;
        }
        .tenant-dropdown-badge {
          flex: 0 0 auto;
          color: var(--color-success);
          font-size: 0.66rem;
          font-weight: 800;
          text-transform: uppercase;
        }
        .tenant-dropdown-doc,
        .tenant-dropdown-empty {
          margin-top: 0.2rem;
          color: var(--color-text-muted);
          font-size: 0.74rem;
          overflow-wrap: anywhere;
        }
        .tenant-dropdown-empty {
          padding: 0.55rem;
        }
        .tenant-dropdown-link {
          display: block;
          margin-top: 0.25rem;
          padding: 0.6rem 0.55rem;
          border-top: 1px solid var(--color-border);
          color: var(--color-text-primary);
          font-size: 0.8rem;
          font-weight: 800;
          text-decoration: none;
        }
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex; }
          .view-mode-label { display: none; }
          .tenant-indicator {
            max-width: 44vw;
            padding: 0 0.5rem;
            gap: 0.35rem;
            font-size: 0.72rem;
          }
          .tenant-indicator-label {
            display: none;
          }
        }
        @media (max-width: 420px) {
          .tenant-indicator {
            max-width: 38vw;
          }
        }
      `}</style>
    </header>
  );
}
