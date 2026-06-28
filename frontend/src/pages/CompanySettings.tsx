import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, KeyRound, MapPin, Plus, Save, Users, X } from 'lucide-react';
import {
  createNfseCredential,
  createTenantCompany,
  fetchNfseCredentials,
  fetchTenantCompanies,
  fetchTenantProfile,
  inviteTenantUser,
  lookupCep,
  updateNfseCredential,
  updateTenantProfile,
} from '../api/tenant';
import { fetchTenantMembers, type TenantMember } from '../api/users';
import { useViewMode } from '../contexts/ViewModeContext';

function formatWorkspaceId(documentValue?: string) {
  const value = (documentValue || '').trim();
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value;
}

function workspaceIdLabel(documentValue?: string) {
  const digits = (documentValue || '').replace(/\D/g, '');
  if (digits.length === 14) return 'CNPJ';
  if (digits.length === 11) return 'CPF';
  return 'ID';
}

function formatTenantCreatedAt(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}${month}${year}`;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '1rem',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0, padding: 0, animation: 'slideUp 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, background: 'var(--color-bg-card)', zIndex: 1 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CompanySettings() {
  const { isMobile } = useViewMode();
  const cols2 = isMobile ? '1fr' : '1fr 1fr';
  const cols21 = isMobile ? '1fr' : '2fr 1fr';
  const cols211 = isMobile ? '1fr' : '2fr 1fr 1fr';
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<'profile' | 'companies' | 'nfse' | 'users' | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const { data: profile, isLoading } = useQuery({ queryKey: ['tenantProfile'], queryFn: fetchTenantProfile });
  const { data: tenantMembers = [] } = useQuery<TenantMember[]>({ queryKey: ['tenant-members'], queryFn: fetchTenantMembers });
  const { data: nfseCredentials } = useQuery({ queryKey: ['nfseCredentials'], queryFn: fetchNfseCredentials });
  const nfseCredential = nfseCredentials?.[0];
  const { data: tenantCompanies = [] } = useQuery({ queryKey: ['tenantCompanies'], queryFn: fetchTenantCompanies });
  const companyLimit = 2;
  const companyLimitReached = tenantCompanies.length >= companyLimit;

  const closeModal = () => { setModal(null); setSuccessMsg(''); setErrorMsg(''); };

  const updateMutation = useMutation({
    mutationFn: updateTenantProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantProfile'] });
      setSuccessMsg('Dados atualizados com sucesso!');
      setTimeout(() => { setSuccessMsg(''); closeModal(); }, 1500);
    },
    onError: () => setErrorMsg('Erro ao atualizar os dados.'),
  });

  const nfseMutation = useMutation({
    mutationFn: (payload: { gov_br_cpf: string; gov_br_password?: string }) => (
      nfseCredential ? updateNfseCredential(nfseCredential.id, payload) : createNfseCredential(payload)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nfseCredentials'] });
      setSuccessMsg('Credenciais salvas com sucesso!');
      setTimeout(() => { setSuccessMsg(''); closeModal(); }, 1500);
    },
    onError: () => setErrorMsg('Erro ao salvar credenciais NFS-e.'),
  });

  const inviteMutation = useMutation({
    mutationFn: inviteTenantUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-members'] });
      setSuccessMsg('Usuário cadastrado com sucesso!');
      setTimeout(() => setSuccessMsg(''), 2000);
    },
    onError: (error: any) => {
      setErrorMsg(error?.response?.data?.detail || 'Erro ao cadastrar usuário.');
    },
  });

  const companyMutation = useMutation({
    mutationFn: createTenantCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantCompanies'] });
      setSuccessMsg('Empresa adicionada com sucesso!');
      setTimeout(() => setSuccessMsg(''), 2000);
    },
    onError: (error: any) => {
      const data = error?.response?.data || {};
      setErrorMsg(data.detail || data.document?.[0] || data.sequence_number?.[0] || 'Erro ao adicionar empresa.');
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMsg(''); setErrorMsg('');
    const formData = new FormData(e.currentTarget);
    if ((formData.get('logo') as File)?.size === 0) formData.delete('logo');
    await updateMutation.mutateAsync(formData);
  };

  const handleCepLookup = async () => {
    const input = document.querySelector<HTMLInputElement>('input[name="postal_code"]');
    const cep = input?.value || '';
    if (!cep.trim()) return;
    setCepLoading(true); setErrorMsg('');
    try {
      const data = await lookupCep(cep);
      document.querySelector<HTMLInputElement>('input[name="address"]')!.value = data.address || '';
      document.querySelector<HTMLInputElement>('input[name="district"]')!.value = data.district || '';
      document.querySelector<HTMLInputElement>('input[name="city"]')!.value = data.city || '';
      document.querySelector<HTMLInputElement>('input[name="state"]')!.value = data.state || '';
      if (input) input.value = data.postal_code || cep;
    } catch {
      setErrorMsg('CEP não encontrado ou serviço indisponível.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleNfseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const gov_br_cpf = String(formData.get('gov_br_cpf') || '');
    const gov_br_password = String(formData.get('gov_br_password') || '');
    await nfseMutation.mutateAsync({ gov_br_cpf, ...(gov_br_password ? { gov_br_password } : {}) });
    e.currentTarget.reset();
  };

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMsg(''); setErrorMsg('');
    const form = e.currentTarget;
    const formData = new FormData(form);
    await inviteMutation.mutateAsync({
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      password: String(formData.get('password') || '').trim(),
      role: String(formData.get('role') || 'member'),
    });
    form.reset();
  };

  const handleCompanySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMsg(''); setErrorMsg('');
    if (companyLimitReached) { setErrorMsg(`Limite de ${companyLimit} empresas por tenant atingido.`); return; }
    const form = e.currentTarget;
    const formData = new FormData(form);
    await companyMutation.mutateAsync({
      sequence_number: String(formData.get('sequence_number') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      document: String(formData.get('document') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      is_active: true,
    });
    form.reset();
  };

  if (isLoading) {
    return <div className="animate-fade-in"><div className="card skeleton" style={{ height: 300 }} /></div>;
  }

  const sections = [
    {
      key: 'profile' as const,
      icon: Building2,
      title: 'Dados da Empresa',
      description: profile?.name || 'Nome, CNPJ, endereço e logo',
    },
    {
      key: 'companies' as const,
      icon: Building2,
      title: 'Empresas do Tenant',
      description: `${tenantCompanies.length}/${companyLimit} cadastros`,
    },
    {
      key: 'users' as const,
      icon: Users,
      title: 'Usuários',
      description: `${tenantMembers.length} membro${tenantMembers.length !== 1 ? 's' : ''}`,
    },
    {
      key: 'nfse' as const,
      icon: KeyRound,
      title: 'Credenciais NFS-e',
      description: nfseCredential?.has_password ? 'Senha configurada' : 'Sem senha configurada',
    },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: 640 }}>
      {/* Header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {profile?.logo
            ? <img src={profile.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <Building2 size={28} style={{ color: 'var(--color-text-muted)' }} />
          }
        </div>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{profile?.name}</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
            {workspaceIdLabel(profile?.document)}: {formatWorkspaceId(profile?.document) || 'Não informado'}
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
            Tenant: {formatTenantCreatedAt(profile?.created_at) || '—'}
          </p>
        </div>
      </div>

      {/* Section list */}
      <div className="card" style={{ padding: 0 }}>
        {sections.map(({ key, icon: Icon, title, description }, i) => (
          <button
            key={key}
            onClick={() => { setModal(key); setSuccessMsg(''); setErrorMsg(''); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: i < sections.length - 1 ? '1px solid var(--color-border)' : 'none',
              textAlign: 'left',
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={16} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 1 }}>{description}</div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          </button>
        ))}
      </div>

      {/* Modal: Dados da Empresa */}
      {modal === 'profile' && (
        <Modal title="Dados da Empresa" onClose={closeModal}>
          {successMsg && <div style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{successMsg}</div>}
          {errorMsg && <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{errorMsg}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)' }}>
              <div><label className="label">Nome da Empresa</label><input type="text" name="name" className="input" defaultValue={profile?.name} required /></div>
              <div><label className="label">CNPJ / CPF</label><input type="text" name="document" className="input" defaultValue={profile?.document} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)' }}>
              <div><label className="label">E-mail de Contato</label><input type="email" name="email" className="input" defaultValue={profile?.email} /></div>
              <div><label className="label">Telefone</label><input type="text" name="phone" className="input" defaultValue={profile?.phone} /></div>
            </div>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', margin: 0 }}>Endereço (para Notas Fiscais)</p>
            <div style={{ display: 'grid', gridTemplateColumns: cols21, gap: 'var(--space-md)' }}>
              <div><label className="label">Logradouro</label><input type="text" name="address" className="input" defaultValue={profile?.address} /></div>
              <div><label className="label">Número</label><input type="text" name="address_number" className="input" defaultValue={profile?.address_number} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)' }}>
              <div><label className="label">Complemento</label><input type="text" name="address_complement" className="input" defaultValue={profile?.address_complement} /></div>
              <div><label className="label">Bairro</label><input type="text" name="district" className="input" defaultValue={profile?.district} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: cols211, gap: 'var(--space-md)' }}>
              <div><label className="label">Cidade</label><input type="text" name="city" className="input" defaultValue={profile?.city} /></div>
              <div><label className="label">Estado (UF)</label><input type="text" name="state" className="input" defaultValue={profile?.state} maxLength={2} /></div>
              <div>
                <label className="label">CEP</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <input type="text" name="postal_code" className="input" defaultValue={profile?.postal_code} />
                  <button type="button" className="btn btn-secondary" onClick={handleCepLookup} disabled={cepLoading}><MapPin size={16} /></button>
                </div>
              </div>
            </div>
            <div>
              <label className="label">Logo da Empresa</label>
              <input type="file" name="logo" className="input" accept="image/*" />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Utilizado na impressão de faturas.</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button type="button" className="btn" onClick={closeModal}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
                <Save size={16} />{updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Empresas do Tenant */}
      {modal === 'companies' && (
        <Modal title="Empresas do Tenant" onClose={closeModal}>
          {successMsg && <div style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{successMsg}</div>}
          {errorMsg && <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{errorMsg}</div>}

          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            Uso atual: {tenantCompanies.length}/{companyLimit}
          </p>

          <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            {tenantCompanies.length === 0
              ? <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Nenhuma empresa cadastrada.</p>
              : tenantCompanies.map((company) => (
                <div key={company.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '90px 1fr auto', gap: 'var(--space-sm)', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Seq. {company.sequence_number}</span>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.88rem' }}>{company.name}</strong>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>{workspaceIdLabel(company.document)}: {formatWorkspaceId(company.document) || 'Não informado'}</span>
                  </div>
                  {company.is_default && <span style={{ color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 600 }}>Padrão</span>}
                </div>
              ))
            }
          </div>

          {companyLimitReached && (
            <div style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
              Limite de {companyLimit} cadastros atingido.
            </div>
          )}

          <form onSubmit={handleCompanySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)' }}>
              <input type="hidden" name="sequence_number" value={String(tenantCompanies.length + 1)} />
              <div><label className="label">Nome</label><input type="text" name="name" className="input" required disabled={companyLimitReached} /></div>
              <div><label className="label">CNPJ / CPF</label><input type="text" name="document" className="input" disabled={companyLimitReached} /></div>
            </div>
            <div>
              <label className="label">E-mail</label>
              <input type="email" name="email" className="input" disabled={companyLimitReached} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={companyLimitReached || companyMutation.isPending}>
                <Plus size={16} />{companyMutation.isPending ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Usuários */}
      {modal === 'users' && (
        <Modal title="Usuários do Tenant" onClose={closeModal}>
          {successMsg && <div style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{successMsg}</div>}
          {errorMsg && <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{errorMsg}</div>}

          {/* Lista de membros */}
          <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            {tenantMembers.length === 0
              ? <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Nenhum membro encontrado.</p>
              : tenantMembers.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-accent)', flexShrink: 0 }}>
                    {(m.user_full_name || m.user_email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{m.user_full_name || m.user_email}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{m.user_email}</div>
                  </div>
                  <span className={m.role === 'owner' ? 'badge badge-success' : m.role === 'admin' ? 'badge badge-info' : 'badge'} style={{ fontSize: '0.7rem' }}>
                    {m.role}
                  </span>
                </div>
              ))
            }
          </div>

          {/* Formulário de convite */}
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            Adicionar usuário <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>({tenantMembers.length}/5)</span>
          </p>
          {tenantMembers.length >= 5 && (
            <div style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
              Limite de 5 usuários por tenant atingido.
            </div>
          )}
          <form onSubmit={handleInviteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)' }}>
              <div><label className="label">Nome completo</label><input type="text" name="name" className="input" required /></div>
              <div><label className="label">E-mail</label><input type="email" name="email" className="input" required /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)' }}>
              <div><label className="label">Senha</label><input type="password" name="password" className="input" placeholder="Mínimo 8 caracteres" minLength={8} required /></div>
              <div>
                <label className="label">Papel</label>
                <select name="role" className="input">
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={inviteMutation.isPending || tenantMembers.length >= 5}>
                <Plus size={16} />{inviteMutation.isPending ? 'Cadastrando...' : 'Adicionar usuário'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Credenciais NFS-e */}
      {modal === 'nfse' && (
        <Modal title="Credenciais NFS-e" onClose={closeModal}>
          {successMsg && <div style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{successMsg}</div>}
          {errorMsg && <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>{errorMsg}</div>}
          <form onSubmit={handleNfseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)' }}>
              <div><label className="label">CPF do portal NFS-e</label><input type="text" name="gov_br_cpf" className="input" defaultValue={nfseCredential?.gov_br_cpf} required /></div>
              <div><label className="label">Senha</label><input type="password" name="gov_br_password" className="input" placeholder={nfseCredential?.has_password ? 'Deixe em branco para manter' : ''} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button type="button" className="btn" onClick={closeModal}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={nfseMutation.isPending}>
                <Save size={16} />{nfseMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
