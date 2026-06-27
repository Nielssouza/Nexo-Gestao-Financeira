import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Shield, Users } from 'lucide-react';
import { fetchTenantCompanies } from '../api/tenant';
import {
  approveUser,
  fetchPendingUsers,
  fetchTenantMembers,
  updateTenantMemberCompanies,
  type PendingUser,
  type TenantMember,
} from '../api/users';
import { useAuth } from '../contexts/AuthContext';

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

export default function PendingUsers() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: members, isLoading: membersLoading, error: membersError } = useQuery({
    queryKey: ['tenant-members'],
    queryFn: fetchTenantMembers,
  });
  const { data: companies = [] } = useQuery({
    queryKey: ['tenantCompanies'],
    queryFn: fetchTenantCompanies,
  });
  const { data: pendingUsers, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-users'],
    queryFn: fetchPendingUsers,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const approveMutation = useMutation({
    mutationFn: approveUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-users'] }),
  });

  const accessMutation = useMutation({
    mutationFn: ({ memberId, companyIds }: { memberId: number; companyIds: number[] }) => (
      updateTenantMemberCompanies(memberId, companyIds)
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-members'] }),
  });

  const toggleCompany = (member: TenantMember, companyId: number) => {
    const selected = new Set(member.allowed_company_ids);
    if (selected.has(companyId)) {
      selected.delete(companyId);
    } else {
      selected.add(companyId);
    }
    accessMutation.mutate({ memberId: member.id, companyIds: Array.from(selected) });
  };

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield size={20} style={{ color: 'var(--color-accent)' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Usuarios do tenant</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
              Defina quais empresas ou PFs cada usuario pode acessar.
            </p>
          </div>
        </div>

        {membersLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : membersError ? (
          <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
            <Users className="empty-state-icon" />
            <h3 className="empty-state-title">Acesso restrito</h3>
            <p className="empty-state-text">Apenas administradores do tenant podem gerenciar usuarios.</p>
          </div>
        ) : members?.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <Users className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhum usuario no tenant</h3>
            <p className="empty-state-text">Os usuarios vinculados ao tenant aparecem aqui.</p>
          </div>
        ) : (
          <div>
            {members?.map((member: TenantMember) => {
              const fullAccess = member.role === 'owner' || member.role === 'admin';
              return (
                <div
                  key={member.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 2fr)',
                    gap: '1rem',
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{member.user_full_name}</span>
                      <span className={fullAccess ? 'badge badge-success' : 'badge badge-info'}>
                        {member.role}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {member.user_email || member.user_username}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {companies.length === 0 ? (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                        Nenhuma empresa cadastrada.
                      </span>
                    ) : companies.map((company) => {
                      const checked = fullAccess || member.allowed_company_ids.includes(company.id);
                      return (
                        <label key={company.id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={fullAccess || accessMutation.isPending}
                            onChange={() => toggleCompany(member, company.id)}
                          />
                          <span>{company.sequence_number} - {company.name}</span>
                        </label>
                      );
                    })}
                    {fullAccess && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                        Owners e admins acessam todas as empresas do tenant.
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {currentUser?.is_superuser && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Users size={20} style={{ color: 'var(--color-accent)' }} />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Cadastros pendentes</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
                Usuarios aguardando aprovacao global.
              </p>
            </div>
          </div>

          {pendingLoading ? (
            <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
              <span className="spinner" />
            </div>
          ) : pendingUsers?.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
              <Users className="empty-state-icon" />
              <h3 className="empty-state-title">Nenhum cadastro pendente</h3>
              <p className="empty-state-text">Todos os cadastros foram aprovados.</p>
            </div>
          ) : (
            <div>
              {pendingUsers?.map((user: PendingUser) => (
                <div
                  key={user.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        {user.first_name
                          ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
                          : user.username}
                      </span>
                      <PersonBadge type={user.person_type} />
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{user.email}</div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: 4, flexWrap: 'wrap' }}>
                      {user.document && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {user.person_type === 'pj' ? 'CNPJ' : 'CPF'}: {formatDoc(user.document)}
                        </span>
                      )}
                      {user.tenant_name && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          Ambiente: {user.tenant_name}
                        </span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Solicitado em {formatDate(user.date_joined)}
                      </span>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ flexShrink: 0 }}
                    onClick={() => approveMutation.mutate(user.id)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle2 size={16} /> Aprovar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
