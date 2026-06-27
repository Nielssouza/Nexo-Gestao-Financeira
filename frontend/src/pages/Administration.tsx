import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  Database,
  LayoutDashboard,
  Shield,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchTenantCompanies, type TenantCompany } from '../api/tenant';
import {
  approveUser,
  fetchPendingUsers,
  fetchTenantMembers,
  type PendingUser,
  type TenantMember,
} from '../api/users';
import { uploadBackupFile } from '../api/system';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'dashboard' | 'cadastros' | 'backup';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDoc(doc: string | null) {
  if (!doc) return '-';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PersonBadge({ type }: { type: 'pf' | 'pj' | null }) {
  if (!type) return null;
  return (
    <span
      className={`badge ${type === 'pj' ? 'badge-info' : 'badge-success'}`}
      style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}
    >
      {type.toUpperCase()}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <Icon size={22} style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text-secondary)' }} />
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({
  members,
  companies,
  pendingUsers,
  isSuperuser,
}: {
  members: TenantMember[];
  companies: TenantCompany[];
  pendingUsers: PendingUser[];
  isSuperuser: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 'var(--space-md)',
        }}
      >
        <KpiCard icon={Users} label="Membros no tenant" value={members.length} />
        <KpiCard icon={Building2} label="Empresas cadastradas" value={companies.length} />
        {isSuperuser && (
          <KpiCard
            icon={Shield}
            label="Cadastros pendentes"
            value={pendingUsers.length}
            accent={pendingUsers.length > 0}
          />
        )}
      </div>

      {members.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div
            style={{
              padding: '0.9rem 1.25rem',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <Users size={16} style={{ color: 'var(--color-text-muted)' }} />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Membros recentes</h3>
          </div>
          <div>
            {members.slice(0, 6).map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1.25rem',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--color-accent)',
                    flexShrink: 0,
                  }}
                >
                  {(m.user_full_name || m.user_email || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                    {m.user_full_name || m.user_email}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{m.user_email}</div>
                </div>
                <span
                  className={
                    m.role === 'owner'
                      ? 'badge badge-success'
                      : m.role === 'admin'
                      ? 'badge badge-info'
                      : 'badge'
                  }
                  style={{ fontSize: '0.7rem' }}
                >
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {companies.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div
            style={{
              padding: '0.9rem 1.25rem',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <Building2 size={16} style={{ color: 'var(--color-text-muted)' }} />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Empresas ativas</h3>
          </div>
          <div>
            {companies
              .filter((c) => c.is_active)
              .map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1.25rem',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{c.sequence_number} — {c.name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500, background: 'var(--color-bg-elevated)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                        Tenant: {c.tenant}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {formatDoc(c.document)}
                      {c.city && (
                        <span>
                          {' '}
                          · {c.city}
                          {c.state ? `/${c.state}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {c.is_default && (
                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                      Padrão
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cadastros Tab ────────────────────────────────────────────────────────────

function CadastrosTab({
  pendingUsers,
  isLoading,
  isSuperuser,
  onApprove,
  isPending,
}: {
  pendingUsers: PendingUser[];
  isLoading: boolean;
  isSuperuser: boolean;
  onApprove: (id: number) => void;
  isPending: boolean;
}) {
  if (!isSuperuser) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
        <Shield className="empty-state-icon" />
        <h3 className="empty-state-title">Acesso restrito</h3>
        <p className="empty-state-text">
          Apenas superadministradores podem gerenciar cadastros globais.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <Users size={20} style={{ color: 'var(--color-accent)' }} />
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Novos cadastros</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
            Solicitações de acesso aguardando aprovação.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
          <span className="spinner" />
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
          <Users className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum cadastro pendente</h3>
          <p className="empty-state-text">Todas as solicitações foram processadas.</p>
        </div>
      ) : (
        <div>
          {pendingUsers.map((u: PendingUser) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: 2,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {u.first_name
                      ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}`
                      : u.username}
                  </span>
                  <PersonBadge type={u.person_type} />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{u.email}</div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: 4, flexWrap: 'wrap' }}>
                  {u.document && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {u.person_type === 'pj' ? 'CNPJ' : 'CPF'}: {formatDoc(u.document)}
                    </span>
                  )}
                  {u.tenant_name && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Tenant: {u.tenant_name}
                    </span>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Solicitado em {formatDate(u.date_joined)}
                  </span>
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={() => onApprove(u.id)}
                disabled={isPending}
              >
                <CheckCircle2 size={16} />
                Aprovar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Empresas Tab ─────────────────────────────────────────────────────────────

function EmpresasTab({ companies }: { companies: TenantCompany[] }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {/* Companies list */}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <Building2 size={20} style={{ color: 'var(--color-accent)' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Empresas do tenant</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
              Todas as empresas vinculadas a este workspace.
            </p>
          </div>
        </div>

        {companies.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <Building2 className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhuma empresa cadastrada</h3>
            <p className="empty-state-text">Adicione empresas em Configurações → Empresa.</p>
          </div>
        ) : (
          <div>
            {companies.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(122,191,0,0.1)',
                    border: '1px solid rgba(122,191,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Building2 size={16} style={{ color: 'var(--color-accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: 2,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                      {c.sequence_number} — {c.name}
                    </span>
                    {c.is_default && (
                      <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                        Padrão
                      </span>
                    )}
                    {!c.is_active && (
                      <span className="badge" style={{ fontSize: '0.7rem', opacity: 0.55 }}>
                        Inativa
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span>{formatDoc(c.document)}</span>
                    {c.city && (
                      <span>
                        {c.city}
                        {c.state ? `/${c.state}` : ''}
                      </span>
                    )}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Backup Tab ───────────────────────────────────────────────────────────────

function BackupTab({ isSuperuser }: { isSuperuser: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  if (!isSuperuser) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
        <Shield className="empty-state-icon" />
        <h3 className="empty-state-title">Acesso restrito</h3>
        <p className="empty-state-text">
          Apenas superadministradores podem gerenciar backups.
        </p>
      </div>
    );
  }

  const handleUpload = async () => {
    if (!file) return;
    if (!confirm('ATENÇÃO: Restaurar o backup substituirá o banco de dados atual. Conexões ativas podem ser interrompidas e dados atuais serão perdidos. Tem certeza?')) return;
    
    setIsUploading(true);
    setMessage(null);
    try {
      const res = await uploadBackupFile(file);
      setMessage({ text: res.detail || 'Backup restaurado com sucesso!', type: 'success' });
      setFile(null);
    } catch (err: any) {
      setMessage({ 
        text: err.response?.data?.detail || err.response?.data?.error || 'Erro ao restaurar backup.', 
        type: 'error' 
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <Database size={20} style={{ color: 'var(--color-accent)' }} />
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Restaurar Backup (PostgreSQL)</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
            Faça upload de um arquivo de backup (.sql, .dump ou .tar) para aplicar no banco de dados.
          </p>
        </div>
      </div>
      
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {message && (
          <div className={`alert alert-${message.type}`} style={{ 
            padding: '1rem', 
            borderRadius: 'var(--radius-md)', 
            background: message.type === 'error' ? 'rgba(255,50,50,0.1)' : 'rgba(50,255,50,0.1)',
            color: message.type === 'error' ? '#ff6b6b' : '#51cf66',
            border: `1px solid ${message.type === 'error' ? 'rgba(255,50,50,0.2)' : 'rgba(50,255,50,0.2)'}`
          }}>
            {message.text}
          </div>
        )}
        
        <input 
          type="file" 
          accept=".sql,.dump,.backup,.tar" 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={isUploading}
          style={{ padding: '0.5rem', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
        />
        
        <button 
          className="btn btn-primary" 
          disabled={!file || isUploading}
          onClick={handleUpload}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {isUploading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Database size={16} />}
          {isUploading ? 'Restaurando...' : 'Restaurar Backup'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Administration() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ['tenant-members'],
    queryFn: fetchTenantMembers,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['tenantCompanies'],
    queryFn: fetchTenantCompanies,
  });

  const { data: pendingUsers = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-users'],
    queryFn: fetchPendingUsers,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const approveMutation = useMutation({
    mutationFn: approveUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-users'] }),
  });

  const isSuperuser = Boolean(currentUser?.is_superuser);

  const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'cadastros', label: 'Cadastros', icon: Users },
    { key: 'backup', label: 'Backup', icon: Database },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {/* Page header */}
      <div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          Administração
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: 2 }}>
          Gerencie membros e solicitações de acesso.
        </p>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 'var(--space-xs)',
        }}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1.1rem',
              background: 'none',
              border: 'none',
              borderBottom: tab === key ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: tab === key ? 700 : 500,
              color: tab === key ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={15} />
            {label}
            {key === 'cadastros' && (pendingUsers as PendingUser[]).length > 0 && (
              <span
                style={{
                  background: 'var(--color-accent)',
                  color: '#000',
                  borderRadius: 999,
                  padding: '1px 6px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  lineHeight: 1.4,
                }}
              >
                {(pendingUsers as PendingUser[]).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && (
        <DashboardTab
          members={members}
          companies={companies}
          pendingUsers={pendingUsers}
          isSuperuser={isSuperuser}
        />
      )}
      {tab === 'cadastros' && (
        <CadastrosTab
          pendingUsers={pendingUsers}
          isLoading={pendingLoading}
          isSuperuser={isSuperuser}
          onApprove={(id) => approveMutation.mutate(id)}
          isPending={approveMutation.isPending}
        />
      )}
      {tab === 'backup' && (
        <BackupTab isSuperuser={isSuperuser} />
      )}
      {false && <EmpresasTab companies={companies} />}
    </div>
  );
}
