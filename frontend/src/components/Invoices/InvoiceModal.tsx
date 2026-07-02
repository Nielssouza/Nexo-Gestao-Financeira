import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users, X, Loader2, Trash2, Pencil } from 'lucide-react';
import {
  createInvoice,
  deleteClient,
  fetchClients,
  fetchServiceCodes,
  lookupClientCnpj,
  updateClient,
  updateInvoice,
  type Client,
  type Invoice,
} from '../../api/invoices';
import { fetchAccounts, type Account } from '../../api/accounts';
import { fetchTenantCompanies } from '../../api/tenant';

const ACTIVE_COMPANY_STORAGE_KEY = 'nexo.activeCompanyId';

interface InvoiceModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

interface ClientForm {
  name: string;
  document: string;
  email: string;
  city: string;
}

export default function InvoiceModal({ invoice, isOpen, onClose }: InvoiceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // client picker
  const [showClients, setShowClients] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm>({
    name: invoice?.client_name || '',
    document: invoice?.client_document || '',
    email: invoice?.client_email || '',
    city: invoice?.client_city || '',
  });
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState('');

  // recurrence
  const [recurrenceType, setRecurrenceType] = useState<Invoice['recurrence_type']>(invoice?.recurrence_type || 'once');
  const [issuerCompanyId, setIssuerCompanyId] = useState<string>(() => {
    if (invoice?.issuer_company) return String(invoice.issuer_company);
    try {
      return localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  // valores para cálculo do líquido
  const [grossValue, setGrossValue] = useState(parseFloat(invoice?.gross_value || '0') || 0);
  const [grossFocused, setGrossFocused] = useState(false);
  const [issRate, setIssRate] = useState(parseFloat(invoice?.iss_rate || '0') || 0);
  const [pisRate, setPisRate] = useState(parseFloat(invoice?.pis_rate || '0') || 0);
  const [cofinsRate, setCofinsRate] = useState(parseFloat(invoice?.cofins_rate || '0') || 0);
  const [csllRate, setCsllRate] = useState(parseFloat(invoice?.csll_rate || '0') || 0);
  const [irRate, setIrRate] = useState(parseFloat(invoice?.ir_rate || '0') || 0);
  const [issWithheld, setIssWithheld] = useState(invoice?.iss_withheld ?? false);

  const calcBase = grossValue;
  const issValue = calcBase * issRate / 100;
  const totalWithheld = calcBase * (pisRate + cofinsRate + csllRate + irRate) / 100 + (issWithheld ? issValue : 0);
  const netValue = grossValue - totalWithheld;

  // launch financial
  const [launchFinancial, setLaunchFinancial] = useState(!invoice);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // service code combobox
  const [serviceCode, setServiceCode] = useState(invoice?.service_code || '1.01');
  const [codeQuery, setCodeQuery] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  const { data: tenantCompanies = [] } = useQuery({
    queryKey: ['tenantCompanies'],
    queryFn: fetchTenantCompanies,
    enabled: isOpen,
  });
  const defaultCompany =
    tenantCompanies.find((c) => String(c.id) === issuerCompanyId) ||
    tenantCompanies.find((c) => c.is_default) ||
    tenantCompanies[0];

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: fetchClients,
    enabled: isOpen,
  });

  const { data: serviceCodes = [] } = useQuery({
    queryKey: ['serviceCodes'],
    queryFn: fetchServiceCodes,
    staleTime: Infinity,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    enabled: isOpen,
  });
  const activeAccounts = accounts.filter((a) => a.is_active);

  const selectedCodeDesc = serviceCodes.find((s) => s.code === serviceCode)?.description || '';

  const filteredCodes = codeQuery.trim()
    ? serviceCodes.filter(
        (s) =>
          s.code.includes(codeQuery) ||
          s.description.toLowerCase().includes(codeQuery.toLowerCase())
      )
    : serviceCodes;

  const filteredClients = clientQuery.trim()
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(clientQuery.toLowerCase()) ||
          c.document.replace(/\D/g, '').includes(clientQuery.replace(/\D/g, ''))
      )
    : clients;

  const isClientAlreadySaved = clients.some((c) => {
    const docMatch = clientForm.document && c.document.replace(/\D/g, '') === clientForm.document.replace(/\D/g, '');
    const nameMatch = clientForm.name && c.name.toLowerCase() === clientForm.name.toLowerCase();
    return docMatch || nameMatch;
  });

  // Close code dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (codeRef.current && !codeRef.current.contains(e.target as Node)) {
        setCodeOpen(false);
      }
    }
    if (codeOpen) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [codeOpen]);

  useEffect(() => {
    function handleCompanyChange(event: Event) {
      const companyId = (event as CustomEvent<{ companyId?: number }>).detail?.companyId;
      if (companyId) setIssuerCompanyId(String(companyId));
    }
    window.addEventListener('nexo:company-change', handleCompanyChange);
    return () => window.removeEventListener('nexo:company-change', handleCompanyChange);
  }, []);

  useEffect(() => {
    if (invoice?.issuer_company) {
      setIssuerCompanyId(String(invoice.issuer_company));
      return;
    }
    if (tenantCompanies.length === 0) return;
    if (issuerCompanyId && tenantCompanies.some((company) => String(company.id) === issuerCompanyId)) return;
    const nextCompany = tenantCompanies.find((company) => company.is_default) || tenantCompanies[0];
    setIssuerCompanyId(String(nextCompany.id));
  }, [invoice?.issuer_company, issuerCompanyId, tenantCompanies]);

  // CNPJ auto-lookup
  useEffect(() => {
    const digits = clientForm.document.replace(/\D/g, '');
    if (digits.length !== 14) {
      setCnpjError('');
      return;
    }
    let cancelled = false;
    setCnpjLoading(true);
    setCnpjError('');
    lookupClientCnpj(digits)
      .then((data) => {
        if (cancelled) return;
        setClientForm((f) => ({
          ...f,
          name: data.name || f.name,
          email: data.email || f.email,
          city: data.city || f.city,
        }));
        setCnpjLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCnpjError('CNPJ não encontrado.');
        setCnpjLoading(false);
      });
    return () => { cancelled = true; };
  }, [clientForm.document]);

  const createMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateInvoice(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const handleSelectClient = (client: Client) => {
    setClientForm({ name: client.name, document: client.document, email: client.email, city: client.city });
    setShowClients(false);
    setClientQuery('');
  };


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!invoice && launchFinancial && !selectedAccount) {
      setError('Selecione uma conta para o lançamento financeiro.');
      return;
    }
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    payload.gross_value = String(grossValue);
    payload.iss_withheld = formData.get('iss_withheld') === 'on' ? 'true' : 'false';
    if (formData.has('launch_financial')) {
      payload.launch_financial = formData.get('launch_financial') === 'on' ? 'true' : 'false';
    }
    if (formData.has('save_client')) {
      payload.save_client = formData.get('save_client') === 'on' ? 'true' : 'false';
    }

    if (!payload.iss_rate) delete payload.iss_rate;
    if (!payload.pis_rate) delete payload.pis_rate;
    if (!payload.cofins_rate) delete payload.cofins_rate;
    if (!payload.csll_rate) delete payload.csll_rate;
    if (!payload.ir_rate) delete payload.ir_rate;
    if (!payload.inss_rate) delete payload.inss_rate;
    if (!payload.expected_account) delete payload.expected_account;
    if (!payload.issuer_company) delete payload.issuer_company;

    try {
      if (invoice) {
        await updateMutation.mutateAsync({ id: invoice.id, payload });
      } else {
        await createMutation.mutateAsync(payload as any);
      }
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar fatura.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h2 className="modal-title">{invoice ? `Fatura ${invoice.number_display}` : 'Nova Fatura'}</h2>
          <button className="btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
              {error}
            </div>
          )}

          {tenantCompanies.length > 0 && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label className="label">Empresa emissora</label>
              <select
                name="issuer_company"
                className="input"
                value={issuerCompanyId || defaultCompany?.id || ''}
                onChange={(e) => setIssuerCompanyId(e.target.value)}
              >
                {tenantCompanies.map((company) => (
                  <option key={company.id} value={company.id}>{company.sequence_number} - {company.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Data de Emissão</label>
              <input type="date" name="issue_date" className="input" defaultValue={invoice?.issue_date || new Date().toISOString().split('T')[0]} required />
            </div>
            <div>
              <label className="label">Data de Vencimento</label>
              <input type="date" name="due_date" className="input" defaultValue={invoice?.due_date || new Date().toISOString().split('T')[0]} required />
            </div>
          </div>

          {/* ── Cliente ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-lg)', marginBottom: 'var(--space-sm)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Cliente</h3>
            <button type="button" onClick={() => { setShowClients(true); setClientQuery(''); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
              <Users size={13} /> Listar clientes
            </button>
          </div>

          {showClients && createPortal(
            <div
              className="modal-overlay"
              style={{ zIndex: 1100 }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowClients(false); }}
            >
              <div className="modal-content" style={{ maxWidth: 480 }}>
                <div className="modal-header">
                  <h2 className="modal-title">Clientes salvos</h2>
                  <button className="btn-ghost btn-icon" type="button" onClick={() => setShowClients(false)}>×</button>
                </div>

                {/* Busca */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', border: '1px solid var(--color-border)' }}>
                  <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou CPF/CNPJ..."
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    autoFocus
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--color-text-primary)' }}
                  />
                  {clientQuery && (
                    <button type="button" onClick={() => setClientQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, display: 'flex' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Lista */}
                <div style={{ maxHeight: 360, overflowY: 'auto', margin: '0 calc(-1 * var(--space-lg))' }}>
                  {filteredClients.length === 0 ? (
                    <div style={{ padding: '20px 16px', fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      Nenhum cliente encontrado.
                    </div>
                  ) : filteredClients.map((client) => (
                    <div
                      key={client.id}
                      style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border)', padding: '0 var(--space-lg)' }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        style={{ flex: 1, textAlign: 'left', padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                      >
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{client.name}</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {client.document}{client.city ? ` · ${client.city}` : ''}{client.email ? ` · ${client.email}` : ''}
                        </div>
                      </button>
                      <button
                        type="button"
                        title="Editar cliente"
                        onClick={() => setEditingClient(client)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--color-text-muted)', display: 'flex', flexShrink: 0 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Excluir cliente"
                        onClick={() => setDeletingClient(client)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--color-text-muted)', display: 'flex', flexShrink: 0 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ── Modal de confirmação de exclusão ── */}
          {deletingClient && createPortal(
            <div
              className="modal-overlay"
              style={{ zIndex: 1200 }}
              onClick={(e) => { if (e.target === e.currentTarget) setDeletingClient(null); }}
            >
              <div className="modal-content" style={{ maxWidth: 380 }}>
                <div className="modal-header">
                  <h2 className="modal-title">Excluir cliente</h2>
                  <button className="btn-ghost btn-icon" type="button" onClick={() => setDeletingClient(null)}>×</button>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
                  Excluir <strong style={{ color: 'var(--color-text-primary)' }}>{deletingClient.name}</strong> da carteira de clientes? Essa ação não pode ser desfeita.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setDeletingClient(null)}>Cancelar</button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      deleteClient(deletingClient.id).then(() => {
                        queryClient.invalidateQueries({ queryKey: ['clients'] });
                        setDeletingClient(null);
                      });
                    }}
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ── Modal de edição de cliente ── */}
          {editingClient && createPortal(
            <div
              className="modal-overlay"
              style={{ zIndex: 1200 }}
              onClick={(e) => { if (e.target === e.currentTarget) setEditingClient(null); }}
            >
              <div className="modal-content" style={{ maxWidth: 440 }}>
                <div className="modal-header">
                  <h2 className="modal-title">Editar cliente</h2>
                  <button className="btn-ghost btn-icon" type="button" onClick={() => setEditingClient(null)}>×</button>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const payload = Object.fromEntries(fd.entries()) as Partial<Client>;
                    await updateClient(editingClient.id, payload);
                    queryClient.invalidateQueries({ queryKey: ['clients'] });
                    setEditingClient(null);
                  }}
                >
                  <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                    <div>
                      <label className="label">Razão Social / Nome</label>
                      <input name="name" className="input" required defaultValue={editingClient.name} />
                    </div>
                    <div>
                      <label className="label">CPF / CNPJ</label>
                      <input name="document" className="input" defaultValue={editingClient.document} />
                    </div>
                    <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)' }}>
                      <div>
                        <label className="label">E-mail</label>
                        <input name="email" type="email" className="input" defaultValue={editingClient.email} />
                      </div>
                      <div>
                        <label className="label">Telefone</label>
                        <input name="phone" className="input" defaultValue={editingClient.phone} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Endereço</label>
                      <input name="address" className="input" defaultValue={editingClient.address} />
                    </div>
                    <div>
                      <label className="label">Cidade</label>
                      <input name="city" className="input" defaultValue={editingClient.city} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditingClient(null)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary">Salvar</button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Razão Social / Nome</label>
              <input type="text" name="client_name" className="input" required value={clientForm.name} onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">CPF / CNPJ</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  name="client_document"
                  className="input"
                  required
                  placeholder="Digite o CNPJ para preencher automaticamente"
                  value={clientForm.document}
                  onChange={(e) => setClientForm((f) => ({ ...f, document: e.target.value }))}
                  style={{
                    paddingRight: cnpjLoading ? 34 : undefined,
                    borderBottomLeftRadius: cnpjLoading ? 0 : undefined,
                    borderBottomRightRadius: cnpjLoading ? 0 : undefined,
                  }}
                />
                {cnpjLoading && (
                  <>
                    <Loader2 size={15} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-accent)', animation: 'spin 1s linear infinite' }} />
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                      background: 'var(--color-border)',
                      borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        background: 'var(--color-accent)',
                        animation: 'cnpj-scan 1.2s ease-in-out infinite',
                      }} />
                    </div>
                  </>
                )}
                <style>{`
                  @keyframes cnpj-scan {
                    0%   { width: 0%;   margin-left: 0%; }
                    50%  { width: 60%;  margin-left: 20%; }
                    100% { width: 0%;   margin-left: 100%; }
                  }
                `}</style>
              </div>
              {cnpjError ? (
                <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'var(--color-danger)' }}>{cnpjError}</p>
              ) : clientForm.document.replace(/\D/g, '').length === 14 && !cnpjLoading ? (
                <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'var(--color-success)' }}>✓ Nome, e-mail e cidade preenchidos automaticamente</p>
              ) : (
                <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'var(--color-accent)' }}>
                  ✦ Digite um CNPJ para autocompletar o cadastro
                </p>
              )}
            </div>
          </div>

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">E-mail</label>
              <input type="email" name="client_email" className="input" value={clientForm.email} onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input type="text" name="client_city" className="input" value={clientForm.city} onChange={(e) => setClientForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
          </div>

          {!invoice && !isClientAlreadySaved && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
              <input type="checkbox" name="save_client" defaultChecked />
              <span style={{ fontSize: '0.85rem' }}>Salvar cliente na carteira para a próxima</span>
            </label>
          )}

          {/* ── Serviço ── */}
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginTop: 'var(--space-lg)', marginBottom: 'var(--space-md)' }}>Serviço e Valores</h3>

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            {/* Service code combobox */}
            <div>
              <label className="label">Código do Serviço (LC 116)</label>
              <input type="hidden" name="service_code" value={serviceCode} />
              <div ref={codeRef} style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Selecione ou digite o código..."
                  value={codeOpen ? codeQuery : (serviceCode ? `${serviceCode} - ${selectedCodeDesc}` : '')}
                  onClick={() => { setCodeOpen(true); setCodeQuery(''); }}
                  onChange={(e) => { setCodeOpen(true); setCodeQuery(e.target.value); }}
                  style={{ cursor: 'pointer' }}
                />
                {codeOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-hover)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    zIndex: 200,
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}>
                    {filteredCodes.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Nenhum código encontrado.</div>
                    ) : filteredCodes.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => { setServiceCode(s.code); setCodeOpen(false); setCodeQuery(''); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '9px 12px', background: s.code === serviceCode ? 'var(--color-accent-muted)' : 'none',
                          border: 'none', borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { if (s.code !== serviceCode) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { if (s.code !== serviceCode) e.currentTarget.style.background = 'none'; }}
                      >
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-accent)', marginRight: 8 }}>{s.code}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-primary)' }}>{s.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="label">Valor Bruto (R$)</label>
              <input
                type="text"
                name="gross_value"
                className="input"
                required
                value={grossFocused
                  ? (grossValue || '')
                  : grossValue
                    ? grossValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : ''}
                onFocus={() => setGrossFocused(true)}
                onBlur={() => setGrossFocused(false)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
                  setGrossValue(parseFloat(digits) || 0);
                }}
                style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label">Descrição do Serviço</label>
            <textarea name="service_description" className="textarea" rows={3} defaultValue={invoice?.service_description} required />
          </div>

          <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>Retenções de Impostos (em %)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: 'var(--space-sm)' }}>
              {([
                { label: 'ISS',   name: 'iss_rate',    value: issRate,    set: setIssRate },
                { label: 'PIS',   name: 'pis_rate',    value: pisRate,    set: setPisRate },
                { label: 'COFINS',name: 'cofins_rate', value: cofinsRate, set: setCofinsRate },
                { label: 'CSLL',  name: 'csll_rate',   value: csllRate,   set: setCsllRate },
                { label: 'IRPJ',  name: 'ir_rate',     value: irRate,     set: setIrRate },
              ] as const).map(({ label, name, value, set }) => (
                <div key={name}>
                  <label className="label" style={{ fontSize: '0.7rem' }}>{label}</label>
                  <input
                    type="number" step="0.01" name={name} className="input"
                    value={value}
                    onChange={(e) => (set as (v: number) => void)(parseFloat(e.target.value) || 0)}
                    style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                  />
                </div>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'var(--space-md)' }}>
              <input
                type="checkbox" name="iss_withheld"
                checked={issWithheld}
                onChange={(e) => setIssWithheld(e.target.checked)}
              />
              <span style={{ fontSize: '0.8rem' }}>ISS Retido pelo tomador (desconta do líquido)</span>
            </label>
          </div>

          {/* Valor líquido calculado */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label">Valor Líquido</label>
            <div className="input" style={{
              display: 'flex', alignItems: 'center',
              fontWeight: 600,
              color: 'var(--color-accent)',
              background: 'var(--color-accent-muted)',
              cursor: 'default',
            }}>
              {netValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>

          {/* ── Recorrência ── */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label">Recorrência</label>
            <select
              name="recurrence_type"
              className="input"
              value={recurrenceType}
              onChange={(e) => setRecurrenceType(e.target.value as Invoice['recurrence_type'])}
            >
              <option value="once">Única</option>
              <option value="monthly">Mensal</option>
              <option value="quarterly">Trimestral</option>
              <option value="yearly">Anual</option>
              <option value="installment">Parcelada</option>
              <option value="fixed">Intervalo fixo</option>
            </select>
            {recurrenceType === 'installment' && (
              <div style={{ marginTop: 'var(--space-sm)' }}>
                <label className="label">Número de parcelas</label>
                <input type="number" name="installment_count" className="input" min={2} max={120} defaultValue={invoice?.installment_count || 2} style={{ maxWidth: 120 }} />
              </div>
            )}
            {recurrenceType === 'fixed' && (
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                <div style={{ flex: 1 }}>
                  <label className="label">Intervalo</label>
                  <input type="number" name="recurrence_interval" className="input" min={1} defaultValue={invoice?.recurrence_interval || 1} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">Unidade</label>
                  <select name="recurrence_interval_unit" className="input" defaultValue={invoice?.recurrence_interval_unit || 'month'}>
                    <option value="day">Dia(s)</option>
                    <option value="month">Mês(es)</option>
                    <option value="year">Ano(s)</option>
                  </select>
                </div>
              </div>
            )}
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {recurrenceType === 'once' && 'Define como o lançamento financeiro dessa fatura se repetirá no futuro.'}
              {recurrenceType === 'monthly' && 'Uma nova fatura será gerada todo mês automaticamente.'}
              {recurrenceType === 'quarterly' && 'Uma nova fatura será gerada a cada 3 meses.'}
              {recurrenceType === 'yearly' && 'Uma nova fatura será gerada uma vez por ano.'}
              {recurrenceType === 'installment' && 'A fatura será dividida em parcelas mensais.'}
              {recurrenceType === 'fixed' && 'Uma nova fatura será gerada no intervalo definido.'}
            </p>
          </div>

          {/* ── Observações ── */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label">Observações</label>
            <textarea name="notes" className="textarea" rows={3} defaultValue={invoice?.notes} />
          </div>

          {!invoice && (
            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  name="launch_financial"
                  checked={launchFinancial}
                  onChange={(e) => {
                    setLaunchFinancial(e.target.checked);
                    if (!e.target.checked) setSelectedAccount(null);
                  }}
                />
                <span style={{ fontSize: '0.85rem' }}>Lançar previsão de recebimento no financeiro automaticamente</span>
              </label>

              {launchFinancial && (
                <div style={{ marginTop: 'var(--space-sm)' }}>
                  <select
                    className="input"
                    value={selectedAccount?.id ?? ''}
                    onChange={(e) => {
                      const acc = activeAccounts.find((a) => a.id === Number(e.target.value)) ?? null;
                      setSelectedAccount(acc);
                    }}
                  >
                    <option value="">Selecione a conta para o lançamento...</option>
                    {activeAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — {acc.account_type === 'bank' ? 'Conta bancária' : acc.account_type === 'cash' ? 'Dinheiro' : 'Cartão'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedAccount && (
                <input type="hidden" name="expected_account" value={selectedAccount.id} />
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Salvando...' : invoice ? 'Salvar' : 'Emitir Fatura'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
