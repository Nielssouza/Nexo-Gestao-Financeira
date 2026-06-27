import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, KeyRound, MapPin, Plus, Save } from 'lucide-react';
import {
  createNfseCredential,
  createTenantCompany,
  fetchNfseCredentials,
  fetchTenantCompanies,
  fetchTenantProfile,
  lookupCep,
  updateNfseCredential,
  updateTenantProfile,
} from '../api/tenant';
import { useViewMode } from '../contexts/ViewModeContext';

function formatWorkspaceId(documentValue?: string) {
  const value = (documentValue || '').trim();
  const digits = value.replace(/\D/g, '');

  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

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
  return `${year}${month}${day}`;
}

export default function CompanySettings() {
  const { isMobile } = useViewMode();
  const cols2 = isMobile ? '1fr' : '1fr 1fr';
  const cols21 = isMobile ? '1fr' : '2fr 1fr';
  const cols211 = isMobile ? '1fr' : '2fr 1fr 1fr';
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['tenantProfile'],
    queryFn: fetchTenantProfile,
  });

  const { data: nfseCredentials } = useQuery({
    queryKey: ['nfseCredentials'],
    queryFn: fetchNfseCredentials,
  });
  const nfseCredential = nfseCredentials?.[0];

  const { data: tenantCompanies = [] } = useQuery({
    queryKey: ['tenantCompanies'],
    queryFn: fetchTenantCompanies,
  });
  const companyLimit = 5;
  const companyLimitReached = tenantCompanies.length >= companyLimit;

  const updateMutation = useMutation({
    mutationFn: updateTenantProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantProfile'] });
      setSuccessMsg('Dados da empresa atualizados com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => {
      setErrorMsg('Erro ao atualizar os dados. Verifique e tente novamente.');
    }
  });

  const nfseMutation = useMutation({
    mutationFn: (payload: { gov_br_cpf: string; gov_br_password?: string }) => (
      nfseCredential
        ? updateNfseCredential(nfseCredential.id, payload)
        : createNfseCredential(payload)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nfseCredentials'] });
      setSuccessMsg('Credenciais NFS-e salvas com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => setErrorMsg('Erro ao salvar credenciais NFS-e.'),
  });

  const companyMutation = useMutation({
    mutationFn: createTenantCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantCompanies'] });
      setSuccessMsg('Empresa adicionada ao tenant com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (error: any) => {
      const data = error?.response?.data || {};
      setErrorMsg(
        data.detail ||
        data.document?.[0] ||
        data.sequence_number?.[0] ||
        'Erro ao adicionar empresa. Verifique a sequencia e tente novamente.'
      );
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');
    
    const formData = new FormData(e.currentTarget);
    const file = formData.get('logo') as File;
    if (file && file.size === 0) {
      formData.delete('logo');
    }

    await updateMutation.mutateAsync(formData);
  };

  const handleCepLookup = async () => {
    const input = document.querySelector<HTMLInputElement>('input[name="postal_code"]');
    const cep = input?.value || '';
    if (!cep.trim()) return;
    setCepLoading(true);
    setErrorMsg('');
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
    await nfseMutation.mutateAsync({
      gov_br_cpf,
      ...(gov_br_password ? { gov_br_password } : {}),
    });
    e.currentTarget.reset();
  };

  const handleCompanySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');

    if (companyLimitReached) {
      setErrorMsg('Este tenant permite no maximo 5 cadastros de CPF/CNPJ.');
      return;
    }

    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = {
      sequence_number: String(formData.get('sequence_number') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      document: String(formData.get('document') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      is_default: formData.get('is_default') === 'on',
      is_active: true,
    };

    await companyMutation.mutateAsync(payload);
    form.reset();
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="card skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="card" style={{ maxWidth: 800 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-bg-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--color-border)',
            overflow: 'hidden'
          }}>
            {profile?.logo ? (
              <img src={profile.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <Building2 size={32} style={{ color: 'var(--color-text-muted)' }} />
            )}
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{profile?.name}</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              {workspaceIdLabel(profile?.document)}: {formatWorkspaceId(profile?.document) || 'Não informado'}
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
              Tenant: {formatTenantCreatedAt(profile?.created_at) || 'Nao informado'}
            </p>
          </div>
        </div>

        {successMsg && (
          <div style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.875rem' }}>
            {successMsg}
          </div>
        )}
        
        {errorMsg && (
          <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.875rem' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Nome da Empresa</label>
              <input type="text" name="name" className="input" defaultValue={profile?.name} required />
            </div>
            <div>
              <label className="label">CNPJ / CPF</label>
              <input type="text" name="document" className="input" defaultValue={profile?.document} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">E-mail de Contato</label>
              <input type="email" name="email" className="input" defaultValue={profile?.email} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input type="text" name="phone" className="input" defaultValue={profile?.phone} />
            </div>
          </div>

          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginTop: 'var(--space-xl)', marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
            Endereço (para Notas Fiscais)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: cols21, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Logradouro</label>
              <input type="text" name="address" className="input" defaultValue={profile?.address} />
            </div>
            <div>
              <label className="label">Número</label>
              <input type="text" name="address_number" className="input" defaultValue={profile?.address_number} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Complemento</label>
              <input type="text" name="address_complement" className="input" defaultValue={profile?.address_complement} />
            </div>
            <div>
              <label className="label">Bairro</label>
              <input type="text" name="district" className="input" defaultValue={profile?.district} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: cols211, gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div>
              <label className="label">Cidade</label>
              <input type="text" name="city" className="input" defaultValue={profile?.city} />
            </div>
            <div>
              <label className="label">Estado (UF)</label>
              <input type="text" name="state" className="input" defaultValue={profile?.state} maxLength={2} />
            </div>
            <div>
              <label className="label">CEP</label>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input type="text" name="postal_code" className="input" defaultValue={profile?.postal_code} />
                <button type="button" className="btn btn-secondary" onClick={handleCepLookup} disabled={cepLoading}>
                  <MapPin size={16} />
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <label className="label">Logo da Empresa</label>
            <input type="file" name="logo" className="input" accept="image/*" />
            <span className="field-error" style={{ color: 'var(--color-text-muted)' }}>Utilizado na impressão de faturas.</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={updateMutation.isPending}
            >
              <Save size={18} />
              {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 800, marginTop: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <Building2 size={22} style={{ color: 'var(--color-accent)' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Empresas do tenant</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              Cadastre ate 5 empresas ou PFs dentro do mesmo tenant. Uso atual: {tenantCompanies.length}/{companyLimit}.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          {tenantCompanies.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Nenhuma empresa cadastrada.</p>
          ) : tenantCompanies.map((company) => (
            <div
              key={company.id}
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '90px 1fr auto',
                gap: 'var(--space-sm)',
                alignItems: 'center',
                padding: '12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-elevated)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                Seq. {company.sequence_number}
              </span>
              <div>
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>{company.name}</strong>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                  {workspaceIdLabel(company.document)}: {formatWorkspaceId(company.document) || 'Nao informado'}
                </span>
              </div>
              {company.is_default && (
                <span style={{ color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 600 }}>Padrao</span>
              )}
            </div>
          ))}
        </div>

        {companyLimitReached && (
          <div style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
            Limite de 5 cadastros de CPF/CNPJ atingido para este tenant.
          </div>
        )}

        <form onSubmit={handleCompanySubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '120px 1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Sequencia</label>
              <input type="text" name="sequence_number" className="input" inputMode="numeric" pattern="[0-9]+" required disabled={companyLimitReached} />
            </div>
            <div>
              <label className="label">Nome</label>
              <input type="text" name="name" className="input" required disabled={companyLimitReached} />
            </div>
            <div>
              <label className="label">CNPJ / CPF</label>
              <input type="text" name="document" className="input" disabled={companyLimitReached} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">E-mail</label>
              <input type="email" name="email" className="input" disabled={companyLimitReached} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end', minHeight: 44 }}>
              <input type="checkbox" name="is_default" disabled={companyLimitReached} />
              <span style={{ fontSize: '0.85rem' }}>Definir como emissor padrao</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={companyLimitReached || companyMutation.isPending}>
              <Plus size={18} />
              {companyMutation.isPending ? 'Adicionando...' : 'Adicionar Empresa'}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 800, marginTop: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <KeyRound size={22} style={{ color: 'var(--color-accent)' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Credenciais NFS-e</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              {nfseCredential?.has_password ? 'Senha configurada' : 'Senha ainda não configurada'}
            </p>
          </div>
        </div>

        <form onSubmit={handleNfseSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">CPF do portal NFS-e</label>
              <input type="text" name="gov_br_cpf" className="input" defaultValue={nfseCredential?.gov_br_cpf} required />
            </div>
            <div>
              <label className="label">Senha</label>
              <input type="password" name="gov_br_password" className="input" placeholder={nfseCredential?.has_password ? 'Deixe em branco para manter' : ''} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={nfseMutation.isPending}>
              <Save size={18} />
              {nfseMutation.isPending ? 'Salvando...' : 'Salvar Credenciais'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
