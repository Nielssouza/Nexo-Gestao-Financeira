import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createInvoice, updateInvoice, type Invoice } from '../../api/invoices';
import { fetchTenantCompanies } from '../../api/tenant';

interface InvoiceModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function InvoiceModal({ invoice, isOpen, onClose }: InvoiceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const queryClient = useQueryClient();

  const { data: tenantCompanies = [] } = useQuery({
    queryKey: ['tenantCompanies'],
    queryFn: fetchTenantCompanies,
    enabled: isOpen,
  });
  const defaultCompany = tenantCompanies.find((company) => company.is_default) || tenantCompanies[0];

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    
    // Tratamentos básicos de tipos (em prod seria melhor usar react-hook-form + zod)
    payload.gross_value = String(payload.gross_value);
    payload.iss_withheld = formData.get('iss_withheld') === 'on' ? 'true' : 'false';
    payload.launch_financial = formData.get('launch_financial') === 'on' ? 'true' : 'false';
    payload.save_client = formData.get('save_client') === 'on' ? 'true' : 'false';

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
                defaultValue={invoice?.issuer_company || defaultCompany?.id || ''}
              >
                {tenantCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.sequence_number} - {company.name}
                  </option>
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

          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginTop: 'var(--space-lg)', marginBottom: 'var(--space-md)' }}>Cliente</h3>
          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Razão Social / Nome</label>
              <input type="text" name="client_name" className="input" defaultValue={invoice?.client_name} required />
            </div>
            <div>
              <label className="label">CNPJ / CPF</label>
              <input type="text" name="client_document" className="input" defaultValue={invoice?.client_document} required />
            </div>
          </div>

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">E-mail</label>
              <input type="email" name="client_email" className="input" defaultValue={invoice?.client_email} />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input type="text" name="client_city" className="input" defaultValue={invoice?.client_city} />
            </div>
          </div>

          {!invoice && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
              <input type="checkbox" name="save_client" defaultChecked={true} />
              <span style={{ fontSize: '0.85rem' }}>Salvar cliente na carteira para a próxima</span>
            </label>
          )}

          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginTop: 'var(--space-lg)', marginBottom: 'var(--space-md)' }}>Serviço e Valores</h3>
          
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label">Descrição do Serviço</label>
            <textarea name="service_description" className="textarea" rows={3} defaultValue={invoice?.service_description} required />
          </div>

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div>
              <label className="label">Código do Serviço (NFS-e)</label>
              <input type="text" name="service_code" className="input" defaultValue={invoice?.service_code || '1.01'} placeholder="1.01" />
            </div>
            <div>
              <label className="label">Valor Bruto (R$)</label>
              <input type="number" step="0.01" min="0.01" name="gross_value" className="input" defaultValue={invoice?.gross_value} required style={{ fontWeight: 600, color: 'var(--color-success)' }} />
            </div>
          </div>

          <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>Retenções de Impostos (em %)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: 'var(--space-sm)' }}>
              <div>
                <label className="label" style={{ fontSize: '0.7rem' }}>ISS</label>
                <input type="number" step="0.01" name="iss_rate" className="input" defaultValue={invoice?.iss_rate || '0.00'} style={{ fontSize: '0.8rem', padding: '6px 8px' }} />
              </div>
              <div>
                <label className="label" style={{ fontSize: '0.7rem' }}>PIS</label>
                <input type="number" step="0.01" name="pis_rate" className="input" defaultValue={invoice?.pis_rate || '0.00'} style={{ fontSize: '0.8rem', padding: '6px 8px' }} />
              </div>
              <div>
                <label className="label" style={{ fontSize: '0.7rem' }}>COFINS</label>
                <input type="number" step="0.01" name="cofins_rate" className="input" defaultValue={invoice?.cofins_rate || '0.00'} style={{ fontSize: '0.8rem', padding: '6px 8px' }} />
              </div>
              <div>
                <label className="label" style={{ fontSize: '0.7rem' }}>CSLL</label>
                <input type="number" step="0.01" name="csll_rate" className="input" defaultValue={invoice?.csll_rate || '0.00'} style={{ fontSize: '0.8rem', padding: '6px 8px' }} />
              </div>
              <div>
                <label className="label" style={{ fontSize: '0.7rem' }}>IRPJ</label>
                <input type="number" step="0.01" name="ir_rate" className="input" defaultValue={invoice?.ir_rate || '0.00'} style={{ fontSize: '0.8rem', padding: '6px 8px' }} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'var(--space-md)' }}>
              <input type="checkbox" name="iss_withheld" defaultChecked={invoice?.iss_withheld} />
              <span style={{ fontSize: '0.8rem' }}>ISS Retido pelo tomador (desconta do líquido)</span>
            </label>
          </div>

          {!invoice && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-xl)' }}>
              <input type="checkbox" name="launch_financial" defaultChecked={true} />
              <span style={{ fontSize: '0.85rem' }}>Lançar previsão de recebimento no financeiro automaticamente</span>
            </label>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Salvando...' : 'Emitir Fatura'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
