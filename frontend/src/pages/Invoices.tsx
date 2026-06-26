import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, CheckCircle2, FileText, Ban, Edit2, Printer, ReceiptText, Send, RefreshCw } from 'lucide-react';
import {
  cancelInvoice,
  emitInvoiceNfse,
  fetchInvoiceNfseGuide,
  fetchInvoiceNfseStatus,
  fetchInvoicePrintData,
  fetchInvoices,
  payInvoice,
  type Invoice,
  type InvoiceNfseGuide,
  type InvoiceNfseStatus,
  type InvoicePrintData,
} from '../api/invoices';
import { fetchAccounts } from '../api/accounts';
import InvoiceModal from '../components/Invoices/InvoiceModal';

function formatCurrency(value: string | number): string {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function nfseLabel(status: Invoice['nfse_status']) {
  if (status === 'nfse_pending') return 'NFS-e pendente';
  if (status === 'nfse_processing') return 'NFS-e emitindo';
  if (status === 'nfse_issued') return 'NFS-e emitida';
  if (status === 'nfse_failed') return 'NFS-e falhou';
  return 'NFS-e';
}

function nfseBadgeClass(status: Invoice['nfse_status']) {
  if (status === 'nfse_issued') return 'badge-success';
  if (status === 'nfse_failed') return 'badge-danger';
  if (status === 'nfse_pending' || status === 'nfse_processing') return 'badge-warning';
  return 'badge-info';
}

function printInvoice(data: InvoicePrintData) {
  const { invoice, tenant, service_code_description } = data;
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Fatura ${invoice.number_display}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 32px; }
          .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #d1d5db; padding-bottom: 18px; margin-bottom: 24px; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          h2 { margin: 24px 0 10px; font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: #374151; }
          p { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          td, th { border: 1px solid #d1d5db; padding: 9px 10px; text-align: left; }
          th { background: #f3f4f6; }
          .right { text-align: right; }
          .total { font-size: 18px; font-weight: 700; }
          @media print { button { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Imprimir</button>
        <div class="head">
          <div>
            <h1>Fatura ${invoice.number_display}</h1>
            <p>Status: ${invoice.status}</p>
            ${invoice.nfse_number ? `<p>NFS-e: ${invoice.nfse_number}</p>` : ''}
          </div>
          <div>
            <strong>${tenant?.name || ''}</strong>
            <p>${tenant?.document || ''}</p>
            <p>${tenant?.full_address || ''}</p>
            <p>${tenant?.email || ''}</p>
          </div>
        </div>
        <h2>Tomador</h2>
        <p><strong>${invoice.client_name}</strong></p>
        <p>${invoice.client_document || ''}</p>
        <p>${invoice.client_email || ''}</p>
        <p>${invoice.client_address || ''} ${invoice.client_city || ''}</p>
        <h2>Servico</h2>
        <p><strong>${invoice.service_code}</strong> ${service_code_description}</p>
        <p>${invoice.service_description}</p>
        <table>
          <tbody>
            <tr><th>Emissao</th><td>${invoice.issue_date}</td><th>Vencimento</th><td>${invoice.due_date || '-'}</td></tr>
            <tr><th>Valor bruto</th><td class="right">${formatCurrency(invoice.gross_value)}</td><th>Retencoes</th><td class="right">${formatCurrency(invoice.total_withheld)}</td></tr>
            <tr><th>Valor liquido</th><td class="right total" colspan="3">${formatCurrency(invoice.net_value)}</td></tr>
          </tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function DataModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Invoices() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [guideData, setGuideData] = useState<InvoiceNfseGuide | null>(null);
  const [statusData, setStatusData] = useState<{ invoice: Invoice; status: InvoiceNfseStatus } | null>(null);

  const queryClient = useQueryClient();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: fetchInvoices,
  });

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });

  const payMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { paid_at: string; account?: number | null; launch_financial?: boolean } }) => payInvoice(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const emitNfseMutation = useMutation({
    mutationFn: emitInvoiceNfse,
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setStatusData({
        invoice,
        status: {
          nfse_status: invoice.nfse_status,
          nfse_error: invoice.nfse_error,
          nfse_requested_at: invoice.nfse_requested_at,
        },
      });
    },
  });

  const handleOpenNew = () => {
    setEditingInvoice(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (inv: Invoice) => {
    setEditingInvoice(inv);
    setModalOpen(true);
  };

  const handlePay = async (invoice: Invoice) => {
    if (!accounts?.length) {
      if (window.confirm(`Marcar fatura ${invoice.number_display} como paga sem lançamento financeiro?`)) {
        payMutation.mutate({ id: invoice.id, payload: { paid_at: new Date().toISOString().split('T')[0], launch_financial: false } });
      }
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const activeAccounts = accounts.filter(a => a.is_active);
    const accountIdStr = prompt(`Pagar fatura ${invoice.number_display}\nValor: ${formatCurrency(invoice.net_value)}\n\nDigite o ID da conta para registrar no financeiro, ou deixe em branco para apenas marcar como paga.\n\nContas ativas: ${activeAccounts.map(a => `${a.id}=${a.name}`).join(', ')}`, invoice.expected_account?.toString() || '');

    if (accountIdStr === null) return;
    if (accountIdStr.trim()) {
      payMutation.mutate({ id: invoice.id, payload: { paid_at: today, launch_financial: true, account: Number(accountIdStr) } });
    } else {
      payMutation.mutate({ id: invoice.id, payload: { paid_at: today, launch_financial: false } });
    }
  };

  const handlePrint = async (invoice: Invoice) => {
    printInvoice(await fetchInvoicePrintData(invoice.id));
  };

  const handleGuide = async (invoice: Invoice) => {
    setGuideData(await fetchInvoiceNfseGuide(invoice.id));
  };

  const handleStatus = async (invoice: Invoice) => {
    setStatusData({ invoice, status: await fetchInvoiceNfseStatus(invoice.id) });
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">Faturas</h2>
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} /> Nova Fatura
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : invoices?.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <FileText className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhuma fatura</h3>
            <p className="empty-state-text">Você ainda não emitiu nenhuma fatura.</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Status</th>
                  <th>Cliente</th>
                  <th>Emissão / Vencimento</th>
                  <th style={{ textAlign: 'right' }}>Valor Bruto</th>
                  <th style={{ textAlign: 'right' }}>Valor Líquido</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {invoices?.map((inv) => (
                  <tr key={inv.id} style={{ opacity: inv.status === 'cancelled' ? 0.6 : 1 }}>
                    <td><strong style={{ cursor: 'pointer' }} onClick={() => handleOpenEdit(inv)}>{inv.number_display}</strong></td>
                    <td>
                      {inv.status === 'draft' && <span className="badge badge-warning">Rascunho</span>}
                      {inv.status === 'issued' && <span className="badge badge-info">Emitida</span>}
                      {inv.status === 'paid' && <span className="badge badge-success">Paga</span>}
                      {inv.status === 'cancelled' && <span className="badge badge-danger">Cancelada</span>}
                      {inv.nfse_status && (
                        <span className={`badge ${nfseBadgeClass(inv.nfse_status)}`} style={{ marginLeft: 6 }}>
                          {nfseLabel(inv.nfse_status)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{inv.client_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{inv.client_document}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {format(parseISO(inv.issue_date), 'dd/MM')} &rarr; {format(parseISO(inv.due_date), 'dd/MM')}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(inv.gross_value)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-accent)' }}>
                      {formatCurrency(inv.net_value)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {inv.status === 'issued' && (
                          <button className="btn-ghost btn-icon" title="Marcar como Paga" onClick={() => handlePay(inv)}>
                            <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                          </button>
                        )}
                        <button className="btn-ghost btn-icon" title="Editar Fatura" onClick={() => handleOpenEdit(inv)}>
                          <Edit2 size={16} />
                        </button>
                        <button className="btn-ghost btn-icon" title="Imprimir Fatura" onClick={() => handlePrint(inv)}>
                          <Printer size={16} />
                        </button>
                        <button className="btn-ghost btn-icon" title="Guia NFS-e" onClick={() => handleGuide(inv)}>
                          <ReceiptText size={16} />
                        </button>
                        <button className="btn-ghost btn-icon" title={nfseLabel(inv.nfse_status)} onClick={() => handleStatus(inv)}>
                          <RefreshCw size={16} />
                        </button>
                        {inv.status === 'issued' && inv.nfse_status !== 'nfse_issued' && (
                          <button className="btn-ghost btn-icon" title="Emitir NFS-e" onClick={() => emitNfseMutation.mutate(inv.id)} disabled={emitNfseMutation.isPending}>
                            <Send size={16} style={{ color: 'var(--color-info)' }} />
                          </button>
                        )}
                        {inv.status !== 'cancelled' && (
                          <button className="btn-ghost btn-icon" title="Cancelar Fatura" onClick={() => { if(window.confirm('Cancelar fatura?')) cancelMutation.mutate(inv.id); }}>
                            <Ban size={16} style={{ color: 'var(--color-danger)' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <InvoiceModal
          invoice={editingInvoice}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}

      {guideData && (
        <DataModal title={`Guia NFS-e ${guideData.invoice.number_display}`} onClose={() => setGuideData(null)}>
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', alignItems: 'center' }}>
              <span className="badge badge-info">{guideData.service_code_description || guideData.invoice.service_code}</span>
              <a className="btn btn-secondary" href={guideData.portal_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                Abrir Portal
              </a>
            </div>

            {Object.entries(guideData.fields).map(([group, values]) => (
              <div key={group}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 'var(--space-sm)', textTransform: 'capitalize' }}>{group}</h3>
                <div className="table-wrapper">
                  <table className="table">
                    <tbody>
                      {Object.entries(values).map(([key, value]) => (
                        <tr key={key}>
                          <td style={{ color: 'var(--color-text-secondary)', width: '35%' }}>{key}</td>
                          <td>{String(value || '-')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </DataModal>
      )}

      {statusData && (
        <DataModal title={`Status NFS-e ${statusData.invoice.number_display}`} onClose={() => setStatusData(null)}>
          <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <span className={`badge ${nfseBadgeClass(statusData.status.nfse_status)}`} style={{ width: 'fit-content' }}>
              {nfseLabel(statusData.status.nfse_status)}
            </span>
            {statusData.status.nfse_requested_at && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                Solicitada em {format(parseISO(statusData.status.nfse_requested_at), 'dd/MM/yyyy HH:mm')}
              </p>
            )}
            {statusData.status.nfse_error && (
              <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '12px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                {statusData.status.nfse_error}
              </div>
            )}
            {(statusData.status.nfse_status === 'nfse_pending' || statusData.status.nfse_status === 'nfse_processing') && (
              <button className="btn btn-secondary" onClick={() => handleStatus(statusData.invoice)}>
                <RefreshCw size={16} /> Atualizar
              </button>
            )}
          </div>
        </DataModal>
      )}
    </div>
  );
}
