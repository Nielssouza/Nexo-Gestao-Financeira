import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, CheckCircle2, FileText, Ban, Edit2, Printer, ReceiptText, Send, RefreshCw, ChevronDown, ChevronUp, MoreVertical } from 'lucide-react';

import {
  cancelInvoice,
  emitInvoiceNfse,
  fetchInvoiceNfseGuide,
  fetchInvoiceNfseStatus,
  fetchInvoicePrintData,
  fetchInvoices,
  payInvoice,
  type Invoice,
  type InvoiceFilters,
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
  if (status === 'nfse_pending' || status === 'nfse_processing') return 'Pendente';
  if (status === 'nfse_issued') return 'Emitida';
  if (status === 'nfse_failed') return 'Cancelada';
  return '—';
}

function nfseBadgeClass(status: Invoice['nfse_status']) {
  if (status === 'nfse_issued') return 'badge-success';
  if (status === 'nfse_failed') return 'badge-danger';
  if (status === 'nfse_pending' || status === 'nfse_processing') return 'badge-warning';
  return 'badge-info';
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastOfMonth() {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveMediaUrl(value?: string | null) {
  if (!value) return null;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;

  const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
  try {
    return new URL(value, apiBase).toString();
  } catch {
    return value;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printIssuerName(data: InvoicePrintData) {
  return (data.issuer_company?.name || data.tenant?.name || 'Empresa emissora').trim();
}

function buildPrintHtml(data: InvoicePrintData): string {
  const { invoice, tenant, service_code_description, responsible_name } = data;
  const issuer = data.issuer_company || tenant;
  const issuerName = printIssuerName(data);
  const logoUrl = resolveMediaUrl(tenant?.logo);

  const statusMap: Record<string, string> = {
    draft:     'RASCUNHO',
    issued:    'EMITIDA',
    paid:      'PAGA',
    cancelled: 'CANCELADA',
  };
  const statusLabel = statusMap[invoice.status] ?? '—';

  function fmtDate(s: string) {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  function fmtCurrency(v: string | number) {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return isNaN(n) ? 'R$ 0,00' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="logo" style="max-width:52px;max-height:52px;object-fit:contain;display:block;">`
    : `<span style="color:#fff;font-size:22px;font-weight:900;line-height:1;">${(issuer?.name || 'N')[0].toUpperCase()}</span>`;

  const row = (label: string, value: string) =>
    value ? `<tr><td style="color:#888;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 0;white-space:nowrap;vertical-align:top;padding-right:20px;">${label}</td><td style="font-size:12px;padding:3px 0;">${escapeHtml(value)}</td></tr>` : '';

  const issuerRows = [
    row('CNPJ/CPF', issuer?.document || ''),
    row('RESPONSÁVEL', responsible_name),
    row('E-MAIL COMERCIAL', issuer?.email || ''),
    row('TELEFONE', issuer?.phone || ''),
    row('ENDEREÇO', issuer?.full_address || ''),
  ].join('');

  const clientRows = [
    row('CPF/CNPJ', invoice.client_document),
    row('TELEFONE', invoice.client_phone),
    row('E-MAIL', invoice.client_email),
    row('ENDEREÇO', [invoice.client_address, invoice.client_city].filter(Boolean).join(' — ')),
  ].join('');

  const notesText = invoice.notes?.trim() ? escapeHtml(invoice.notes.trim()) : '—';
  const withheld = parseFloat(invoice.total_withheld || '0');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(issuerName)}</title>
<style>
  @page{size:auto;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;padding:48px 52px;font-size:13px;line-height:1.5}
  .print-btn{display:inline-flex;align-items:center;gap:8px;padding:8px 22px;background:#111;color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:.04em}
  @media print{html,body{width:100%;min-height:100%;}.print-actions{display:none!important}body{padding:24px 28px}}
  hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
  .section-label{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px}
  .company-name{font-size:14px;font-weight:800;margin-bottom:8px;letter-spacing:.01em}
  .service-header{font-size:11px;font-weight:700;margin-bottom:10px;color:#374151;letter-spacing:.02em}
  .service-body{background:#f9fafb;border:1px solid #e5e7eb;padding:12px 16px;font-size:12px;line-height:1.7;white-space:pre-wrap}
  .val-row{display:flex;justify-content:space-between;align-items:baseline;padding:5px 0}
  .val-label{font-size:12px;color:#555}
  .val-amount{font-size:12px}
  .val-row.total{border-top:2px solid #111;margin-top:10px;padding-top:14px}
  .val-row.total .val-label{font-size:15px;font-weight:800;color:#111}
  .val-row.total .val-amount{font-size:20px;font-weight:900;color:#111}
</style>
</head>
<body>

<div class="print-actions" style="display:flex;gap:12px;margin-bottom:28px;">
  <button class="print-btn" onclick="window.print()">&#128438; Imprimir</button>
  <button class="print-btn" style="background:#e5e7eb;color:#111;" onclick="window.close()">&#10006; Fechar</button>
</div>

<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #111;margin-bottom:22px">
  <div style="width:58px;height:58px;background:#111;display:flex;align-items:center;justify-content:center;flex-shrink:0">
    ${logoBlock}
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:900;letter-spacing:.01em">Fatura ${escapeHtml(invoice.number_display)}</div>
    ${invoice.nfse_number ? `<div style="margin-top:4px;font-size:11px;color:#6b7280">NFS-e: ${escapeHtml(invoice.nfse_number)}</div>` : ''}
    <div style="margin-top:6px;display:inline-block;padding:3px 12px;background:#111;color:#fff;font-size:10px;font-weight:800;letter-spacing:.1em">${statusLabel}</div>
  </div>
</div>

<div style="margin-bottom:20px">
  <div class="section-label">Informações da Fatura</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
    <div>
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">Data de Emissão</div>
      <div style="font-size:13px;font-weight:700">${fmtDate(invoice.issue_date)}</div>
    </div>
    <div>
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">Data de Vencimento</div>
      <div style="font-size:13px;font-weight:700">${fmtDate(invoice.due_date)}</div>
    </div>
  </div>
</div>

<hr>

<div style="margin-bottom:20px">
  <div class="section-label">Prestador do Serviço (Emissor)</div>
  <div class="company-name">${escapeHtml(issuerName)}</div>
  <table style="border-collapse:collapse"><tbody>${issuerRows}</tbody></table>
</div>

<hr>

<div style="margin-bottom:20px">
  <div class="section-label">Tomador do Serviço (Cliente)</div>
  <div class="company-name">${escapeHtml(invoice.client_name)}</div>
  <table style="border-collapse:collapse"><tbody>${clientRows}</tbody></table>
</div>

<hr>

<div style="margin-bottom:20px">
  <div class="section-label">Discriminação dos Serviços</div>
  ${invoice.service_code ? `<div class="service-header">CÓDIGO DO SERVIÇO: ${escapeHtml(invoice.service_code)}${service_code_description ? ` — ${escapeHtml(service_code_description).toUpperCase()}` : ''}</div>` : ''}
  <div class="service-body">${escapeHtml(invoice.service_description || '')}</div>
</div>

<hr>
<div style="margin-bottom:20px">
  <div class="section-label">Observações</div>
  <div style="font-size:12px;line-height:1.7;white-space:pre-wrap">${notesText}</div>
</div>

<hr>

<div style="max-width:380px;margin-left:auto">
  <div class="val-row">
    <span class="val-label">Valor do Serviço</span>
    <span class="val-amount">${fmtCurrency(invoice.gross_value)}</span>
  </div>
  ${withheld > 0 ? `<div class="val-row">
    <span class="val-label">Impostos Retidos</span>
    <span class="val-amount">− ${fmtCurrency(withheld)}</span>
  </div>` : ''}
  <div class="val-row total">
    <span class="val-label">Valor da Fatura</span>
    <span class="val-amount">${fmtCurrency(invoice.net_value)}</span>
  </div>
</div>

</body>
</html>`;
}

function ActionsDropdown({ invoice, onEdit, onPay, onPrint, onGuide, onStatus, onEmitNfse, onCancel }: {
  invoice: Invoice;
  onEdit: () => void;
  onPay: () => void;
  onPrint: () => void;
  onGuide: () => void;
  onStatus: () => void;
  onEmitNfse: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = ref.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const getMenuStyle = (): CSSProperties => {
    const rect = ref.current?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < 769;
    const width = isMobile ? 150 : 168;
    const bottomSafeArea = isMobile ? 104 : 12;
    const visibleItems = [
      invoice.status === 'issued',
      true,
      true,
      invoice.status === 'issued',
      Boolean(invoice.status === 'issued' && invoice.nfse_status && invoice.nfse_status !== 'nfse_issued'),
      invoice.status === 'issued' && invoice.nfse_status !== 'nfse_issued',
      invoice.status !== 'cancelled',
    ].filter(Boolean).length;
    const estimatedHeight = Math.min(visibleItems * 36 + 8, viewportHeight - bottomSafeArea - 16);

    if (!rect) {
      return { position: 'fixed', top: 8, left: 8, width };
    }

    const availableBelow = viewportHeight - rect.bottom - bottomSafeArea;
    const openDownTop = rect.bottom + 4;
    const openUpTop = rect.top - estimatedHeight - 4;
    const top = Math.max(
      8,
      Math.min(
        availableBelow >= estimatedHeight ? openDownTop : openUpTop,
        viewportHeight - estimatedHeight - bottomSafeArea,
      ),
    );
    const left = Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8));

    return {
      position: 'fixed',
      top,
      left,
      width,
      maxHeight: `calc(100vh - ${bottomSafeArea + 16}px)`,
    };
  };

  const item = (label: string, icon: ReactNode, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
        fontSize: '0.8rem', fontWeight: 500, textAlign: 'left',
        color: danger ? 'var(--color-danger)' : 'var(--color-text-primary)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'var(--color-danger-muted)' : 'rgba(255,255,255,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      {icon}{label}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn-ghost btn-icon" onClick={() => setOpen((v) => !v)}>
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{
          ...getMenuStyle(),
          zIndex: 999,
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border-hover)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflowY: 'auto',
        }}>
          {invoice.status === 'issued' && item('Marcar como Paga', <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} />, onPay)}
          {item('Editar', <Edit2 size={14} />, onEdit)}
          {item('Imprimir', <Printer size={14} />, onPrint)}
          {invoice.status === 'issued' && item('Guia NFS-e', <ReceiptText size={14} />, onGuide)}
          {invoice.status === 'issued' && invoice.nfse_status && invoice.nfse_status !== 'nfse_issued' &&
            item('Status NFS-e', <RefreshCw size={14} />, onStatus)}
          {invoice.status === 'issued' && invoice.nfse_status !== 'nfse_issued' &&
            item('Emitir NFS-e', <Send size={14} style={{ color: 'var(--color-info)' }} />, onEmitNfse)}
          {invoice.status !== 'cancelled' && (
            <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 2, paddingTop: 2 }}>
              {item('Cancelar', <Ban size={14} />, onCancel, true)}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function DataModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default function Invoices() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [guideData, setGuideData] = useState<InvoiceNfseGuide | null>(null);
  const [statusData, setStatusData] = useState<{ invoice: Invoice; status: InvoiceNfseStatus } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = useState<InvoiceFilters>({
    status: '',
    start: firstOfMonth(),
    end: lastOfMonth(),
  });

  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', filters],
    queryFn: () => fetchInvoices(filters),
  });

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });

  const totalFaturado = invoices
    .filter((inv) => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + parseFloat(inv.net_value || '0'), 0);

  const filterSummary = [
    filters.status ? `Status: ${filters.status}` : 'Status Todos',
    filters.start || filters.end ? 'e periodo selecionado' : '',
  ].filter(Boolean).join(' ');

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
      setCancelTarget(null);
    },
  });

  const emitNfseMutation = useMutation({
    mutationFn: emitInvoiceNfse,
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setStatusData({ invoice, status: { nfse_status: invoice.nfse_status, nfse_error: invoice.nfse_error, nfse_requested_at: invoice.nfse_requested_at } });
    },
  });

  const handleOpenNew = () => { setEditingInvoice(null); setModalOpen(true); };
  const handleOpenEdit = (inv: Invoice) => { setEditingInvoice(inv); setModalOpen(true); };

  const handlePay = async (invoice: Invoice) => {
    if (!accounts?.length) {
      if (window.confirm(`Marcar fatura ${invoice.number_display} como paga sem lançamento financeiro?`)) {
        payMutation.mutate({ id: invoice.id, payload: { paid_at: new Date().toISOString().split('T')[0], launch_financial: false } });
      }
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const activeAccounts = accounts.filter(a => a.is_active);
    const accountIdStr = prompt(
      `Pagar fatura ${invoice.number_display}\nValor: ${formatCurrency(invoice.net_value)}\n\nDigite o ID da conta para registrar no financeiro, ou deixe em branco para apenas marcar como paga.\n\nContas ativas: ${activeAccounts.map(a => `${a.id}=${a.name}`).join(', ')}`,
      invoice.expected_account?.toString() || ''
    );
    if (accountIdStr === null) return;
    if (accountIdStr.trim()) {
      payMutation.mutate({ id: invoice.id, payload: { paid_at: today, launch_financial: true, account: Number(accountIdStr) } });
    } else {
      payMutation.mutate({ id: invoice.id, payload: { paid_at: today, launch_financial: false } });
    }
  };

  const handlePrint = async (invoice: Invoice) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) { alert('Permita popups para imprimir.'); return; }
    try {
      printWindow.history.replaceState(null, '', '/fatura');
    } catch {
      // Some browsers may block history changes on a newly opened print window.
    }
    printWindow.document.write('<p>Carregando...</p>');
    const data = await fetchInvoicePrintData(invoice.id);
    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(data));
    printWindow.document.close();
  };
  const handleGuide = async (invoice: Invoice) => { setGuideData(await fetchInvoiceNfseGuide(invoice.id)); };
  const handleStatus = async (invoice: Invoice) => { setStatusData({ invoice, status: await fetchInvoiceNfseStatus(invoice.id) }); };

  return (
    <div className="animate-fade-in">
      <style>{`input[type="date"]::-webkit-calendar-picker-indicator { filter: brightness(0) invert(1); cursor: pointer; }`}</style>
      <div className="page-header">
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} /> Nova Fatura
        </button>
      </div>

      {/* ── Cards de resumo ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Total Faturado</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-success)' }}>{formatCurrency(totalFaturado)}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Quantidade</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{invoices.filter(i => i.status !== 'cancelled').length}</div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="card" style={{ marginBottom: 'var(--space-md)', padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: 'var(--space-sm) var(--space-md)',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>Filtros</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{filterSummary}</div>
          </div>
          {filtersOpen ? <ChevronUp size={16} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-text-muted)' }} />}
        </button>

        {filtersOpen && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="">Todos</option>
                  <option value="draft">Rascunho</option>
                  <option value="issued">Emitida</option>
                  <option value="paid">Paga</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>
              <div>
                <label className="label">Data Inicial</label>
                <input
                  type="date"
                  className="input"
                  value={filters.start}
                  onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Data Final</label>
                <input
                  type="date"
                  className="input"
                  value={filters.end}
                  onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => setFilters({ status: '', start: '', end: '' })}
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {/* ── Tabela ── */}
      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <FileText className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhuma fatura encontrada</h3>
            <p className="empty-state-text">Tente ajustar os filtros ou emita uma nova fatura.</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Status</th>
                  <th>Status NF-e</th>
                  <th>Cliente</th>
                  <th>CPF / CNPJ</th>
                  <th>Emissão</th>
                  <th>Vencimento</th>
                  <th style={{ textAlign: 'right' }}>Valor Bruto</th>
                  <th style={{ textAlign: 'right' }}>Valor Líquido</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ opacity: inv.status === 'cancelled' ? 0.6 : 1 }}>
                    <td><strong style={{ cursor: 'pointer' }} onClick={() => handleOpenEdit(inv)}>{inv.number_display}</strong></td>
                    <td>
                      {inv.status === 'draft' && <span className="badge badge-warning">Fatura Rascunho</span>}
                      {inv.status === 'issued' && <span className="badge badge-info">Fatura Emitida</span>}
                      {inv.status === 'paid' && <span className="badge badge-success">Fatura Paga</span>}
                      {inv.status === 'cancelled' && <span className="badge badge-danger">Fatura Cancelada</span>}
                    </td>
                    <td>
                      {inv.nfse_status
                        ? <span className={`badge ${nfseBadgeClass(inv.nfse_status)}`}>{nfseLabel(inv.nfse_status)}</span>
                        : <span className="badge" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-muted)' }}>Não emitida</span>
                      }
                    </td>
                    <td style={{ fontWeight: 500 }}>{inv.client_name}</td>
                    <td>{inv.client_document}</td>
                    <td>{format(parseISO(inv.issue_date), 'dd/MM/yy')}</td>
                    <td>{format(parseISO(inv.due_date), 'dd/MM/yy')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(inv.gross_value)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-accent)' }}>{formatCurrency(inv.net_value)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <ActionsDropdown
                        invoice={inv}
                        onEdit={() => handleOpenEdit(inv)}
                        onPay={() => handlePay(inv)}
                        onPrint={() => handlePrint(inv)}
                        onGuide={() => handleGuide(inv)}
                        onStatus={() => handleStatus(inv)}
                        onEmitNfse={() => emitNfseMutation.mutate(inv.id)}
                        onCancel={() => setCancelTarget(inv)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <InvoiceModal invoice={editingInvoice} isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      )}

      {cancelTarget && (
        <DataModal title="Cancelar fatura" onClose={() => setCancelTarget(null)}>
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            <div>
              <p style={{ color: 'var(--color-text-primary)', fontSize: '0.95rem', fontWeight: 600 }}>
                Cancelar fatura {cancelTarget.number_display}?
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: 6 }}>
                Essa ação altera o status da fatura e remove o lançamento financeiro pendente vinculado, se existir.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCancelTarget(null)}
                disabled={cancelMutation.isPending}
              >
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => cancelMutation.mutate(cancelTarget.id)}
                disabled={cancelMutation.isPending}
              >
                <Ban size={16} />
                {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar fatura'}
              </button>
            </div>
          </div>
        </DataModal>
      )}

      {guideData && (
        <DataModal title={`Guia NFS-e ${guideData.invoice.number_display}`} onClose={() => setGuideData(null)}>
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', alignItems: 'center' }}>
              <span className="badge badge-info">{guideData.service_code_description || guideData.invoice.service_code}</span>
              <a className="btn btn-secondary" href={guideData.portal_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Abrir Portal</a>
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
