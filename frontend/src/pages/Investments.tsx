import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowLeft, TrendingUp, PiggyBank, Edit2, Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { 
  fetchInvestments, fetchInvestment, createInvestment, updateInvestment, deleteInvestment,
  createInvestmentEntry, deleteInvestmentEntry, type Investment 
} from '../api/investments';
import InvestmentModal from '../components/Investments/InvestmentModal';

function formatCurrency(value: string | number): string {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Investments() {
  const [selectedInvId, setSelectedInvId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInv, setEditingInv] = useState<Investment | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  const queryClient = useQueryClient();

  const { data: investments, isLoading: invsLoading } = useQuery({
    queryKey: ['investments'],
    queryFn: fetchInvestments,
  });

  const { data: currentInv, isLoading: invLoading } = useQuery({
    queryKey: ['investment', selectedInvId],
    queryFn: () => fetchInvestment(selectedInvId!),
    enabled: !!selectedInvId,
  });

  const createMutation = useMutation({
    mutationFn: createInvestment,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['investments'] }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateInvestment(id, payload),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['investments'] }); 
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInvestment,
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['investments'] }); 
      setSelectedInvId(null);
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: createInvestmentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ['investments'] });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: deleteInvestmentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ['investments'] });
    },
  });

  const handleOpenNew = () => {
    setEditingInv(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (inv: Investment, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingInv(inv);
    setModalOpen(true);
  };

  const handleSave = async (payload: any) => {
    if (editingInv) {
      await updateMutation.mutateAsync({ id: editingInv.id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const handleCreateEntry = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedInvId) return;
    
    const formData = new FormData(e.currentTarget);
    const entry_type = formData.get('entry_type') as string;
    const date = formData.get('date') as string;
    const amount = Number(formData.get('amount'));
    const description = formData.get('description') as string;

    if (amount > 0) {
      createEntryMutation.mutate({
        investment: selectedInvId,
        entry_type: entry_type as any,
        date,
        amount: amount.toString(),
        description,
      });
      e.currentTarget.reset();
      // default date back to today
      const dateInput = e.currentTarget.elements.namedItem('date') as HTMLInputElement;
      if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    }
  };

  if (selectedInvId) {
    // Detail View
    if (invLoading) return <div className="page-header"><span className="spinner"/></div>;
    
    return (
      <div className="animate-slide-in investments-page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <button className="btn-ghost btn-icon" onClick={() => setSelectedInvId(null)}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {currentInv?.name}
                <button className="btn-ghost btn-icon" style={{ width: 24, height: 24, padding: 4 }} onClick={() => handleOpenEdit(currentInv!)}>
                  <Edit2 size={14} />
                </button>
              </h2>
              <div className="investment-detail-meta" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                {currentInv?.broker} • {currentInv?.investment_type}
              </div>
            </div>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="kpi-card">
            <div className="kpi-label">Aportes (Total)</div>
            <div className="kpi-value">{formatCurrency(currentInv?.total_invested || 0)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Resgates (Total)</div>
            <div className="kpi-value negative">{formatCurrency(currentInv?.total_withdrawn || 0)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Rendimentos / Div.</div>
            <div className="kpi-value positive">{formatCurrency(currentInv?.total_earnings || 0)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Saldo Líquido (Aportes)</div>
            <div className="kpi-value accent">{formatCurrency(currentInv?.net_invested || 0)}</div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Novo Lançamento</h3>
          <form className="investment-entry-form" onSubmit={handleCreateEntry} style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-xl)' }}>
            <select name="entry_type" className="select" style={{ width: 140 }} required>
              <option value="deposit">Aporte</option>
              <option value="withdrawal">Resgate</option>
              <option value="dividend">Dividendo</option>
              <option value="yield">Rendimento</option>
            </select>
            <input type="date" name="date" className="input" defaultValue={new Date().toISOString().split('T')[0]} style={{ width: 140 }} required />
            <input type="number" step="0.01" min="0.01" name="amount" className="input" placeholder="Valor (R$)" style={{ width: 140 }} required />
            <input type="text" name="description" className="input" placeholder="Descrição (opcional)" style={{ flex: 1, minWidth: 200 }} />
            <button type="submit" className="btn btn-primary" disabled={createEntryMutation.isPending}>
              Adicionar
            </button>
          </form>

          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Histórico de Lançamentos</h3>
          {currentInv?.entries?.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
              <p className="empty-state-text">Nenhum lançamento registrado.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {currentInv?.entries?.map((entry) => (
                    <tr key={entry.id}>
                      <td>{format(parseISO(entry.date), 'dd/MM/yyyy')}</td>
                      <td>
                        {entry.entry_type === 'deposit' && <span className="badge badge-success">Aporte</span>}
                        {entry.entry_type === 'withdrawal' && <span className="badge badge-danger">Resgate</span>}
                        {entry.entry_type === 'dividend' && <span className="badge badge-info">Dividendo</span>}
                        {entry.entry_type === 'yield' && <span className="badge badge-info">Rendimento</span>}
                      </td>
                      <td>{entry.description || '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: entry.entry_type === 'withdrawal' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {entry.entry_type === 'withdrawal' ? '-' : '+'}{formatCurrency(entry.amount)}
                      </td>
                      <td>
                        <button 
                          className="btn-ghost btn-icon" 
                          onClick={() => { if(window.confirm('Excluir lançamento?')) deleteEntryMutation.mutate(entry.id); }}
                        >
                          <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {modalOpen && (
          <InvestmentModal
            investment={editingInv}
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            onSave={handleSave}
            onDelete={(id) => deleteMutation.mutateAsync(id)}
          />
        )}
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    stocks: 'Ações', fii: 'FII', fixed_income: 'Renda Fixa',
    crypto: 'Cripto', savings: 'Poupança', emergency: 'Reserva', other: 'Outros',
  };

  // List View
  const filtered = useMemo(() => {
    return (investments ?? []).filter((inv) => {
      if (filterStatus === 'active' && !inv.is_active) return false;
      if (filterStatus === 'inactive' && inv.is_active) return false;
      if (filterType && inv.investment_type !== filterType) return false;
      if (search && !inv.name.toLowerCase().includes(search.toLowerCase()) && !inv.broker.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [investments, filterStatus, filterType, search]);

  const totalInvested  = filtered.reduce((s, i) => s + parseFloat(i.total_invested  || '0'), 0);
  const totalWithdrawn = filtered.reduce((s, i) => s + parseFloat(i.total_withdrawn || '0'), 0);
  const totalEarnings  = filtered.reduce((s, i) => s + parseFloat(i.total_earnings  || '0'), 0);
  const totalNet       = filtered.reduce((s, i) => s + parseFloat(i.net_invested     || '0'), 0);

  return (
    <div className="animate-fade-in investments-page">
      <div className="page-header">
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} /> Novo Investimento
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Total Aportado</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{formatCurrency(totalInvested)}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Resgates</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-danger)' }}>{formatCurrency(totalWithdrawn)}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Rendimentos</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-success)' }}>{formatCurrency(totalEarnings)}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Patrimônio Líquido</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-accent)' }}>{formatCurrency(totalNet)}</div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="card" style={{ marginBottom: 'var(--space-md)', padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 'var(--space-sm) var(--space-md)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>Filtros</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {[
                filterStatus === 'active' ? 'Ativos' : filterStatus === 'inactive' ? 'Inativos' : 'Todos',
                filterType ? typeLabels[filterType] : '',
                search ? `"${search}"` : '',
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          {filtersOpen ? <ChevronUp size={16} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-text-muted)' }} />}
        </button>

        {filtersOpen && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  className="input"
                  placeholder="Buscar por nome ou corretora…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: 32 }}
                />
              </div>
              <div>
                <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">Todos os tipos</option>
                  {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="active">Somente ativos</option>
                  <option value="inactive">Somente inativos</option>
                  <option value="">Todos</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => { setSearch(''); setFilterType(''); setFilterStatus('active'); }}
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {invsLoading ? (
        <div className="investment-list-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 160 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <TrendingUp className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum investimento encontrado</h3>
          <p className="empty-state-text">{investments?.length ? 'Tente ajustar os filtros.' : 'Comece a registrar seus investimentos e controle seus aportes.'}</p>
        </div>
      ) : (
        <div className="investment-list-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
          {filtered.map((inv) => (
            <div 
              key={inv.id} 
              className="card" 
              style={{ cursor: 'pointer', opacity: inv.is_active ? 1 : 0.6 }}
              onClick={() => setSelectedInvId(inv.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
                <div>
                  <h3 className="investment-card-title" style={{ fontSize: '1.1rem', fontWeight: 600 }}>{inv.name}</h3>
                  <div className="investment-card-meta" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {inv.broker} • {inv.investment_type}
                  </div>
                </div>
                <PiggyBank style={{ color: 'var(--color-accent)', opacity: 0.5 }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-md)' }}>
                <div className="investment-card-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Total Aportado</span>
                  <span>{formatCurrency(inv.total_invested)}</span>
                </div>
                <div className="investment-card-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Rendimentos</span>
                  <span className="positive">{formatCurrency(inv.total_earnings)}</span>
                </div>
                <div className="investment-card-total" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Saldo Líquido</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{formatCurrency(inv.net_invested)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <InvestmentModal
          investment={editingInv}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
