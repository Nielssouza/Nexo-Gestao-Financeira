import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  fetchTransactions,
  fetchStatementSummary,
  deleteTransaction,
  toggleTransactionCleared,
  toggleTransactionIgnored,
  fetchClosedMonths,
  type Transaction
} from '../api/transactions';
import { fetchAccounts } from '../api/accounts';
import ClearTransactionModal from '../components/Transactions/ClearTransactionModal';
import { useNavigate } from 'react-router-dom';
import { Wallet, Tags, ChevronDown } from 'lucide-react';

function formatCurrency(value: string | number | null): string {
  if (value == null) return '••••••';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(current: string, delta: number): string {
  const [y, m] = current.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return getMonthParam(d);
}

function getMonthBounds(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
  const end = new Date(y, m, 0).toISOString().split('T')[0];
  return { start, end };
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month') || getMonthParam(new Date());
  const { start, end } = getMonthBounds(monthParam);

  const [accountFilter, setAccountFilter] = useState('');
  const [orderBy, setOrderBy] = useState('-date');
  const navigate = useNavigate();
  const [clearingTx, setClearingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [deleteScope, setDeleteScope] = useState<'current' | 'all'>('current');
  const [errorModalMessage, setErrorModalMessage] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (deletingTx) {
      setDeleteScope('current');
    }
  }, [deletingTx]);

  const queryClient = useQueryClient();

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', monthParam, accountFilter, orderBy],
    queryFn: () => fetchTransactions({
      date__gte: start,
      date__lte: end,
      account: accountFilter || undefined,
      ordering: orderBy || undefined,
    }),
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  });

  // Handle paginated or direct array responses for accounts
  const accounts = Array.isArray(accountsData) ? accountsData : (accountsData as any)?.results || [];

  const { data: summary } = useQuery({
    queryKey: ['statement_summary', monthParam],
    queryFn: () => fetchStatementSummary({ month: monthParam }),
  });

  const [yearNumber, monthNumber] = monthParam.split('-').map(Number);
  const { data: closedMonths } = useQuery({
    queryKey: ['closed-months', monthParam],
    queryFn: () => fetchClosedMonths({ year: yearNumber, month: monthNumber }),
  });
  const closedMonth = closedMonths?.[0];
  const isMonthClosed = !!closedMonth?.is_closed;

  const requestUnlockPassword = () => {
    if (!isMonthClosed) return undefined;
    const password = window.prompt('Mês fechado. Informe sua senha para confirmar esta alteração:');
    return password || undefined;
  };

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['statement_summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      setErrorModalMessage(err.response?.data?.detail || 'Erro ao excluir transação.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleTransactionCleared,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['statement_summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: toggleTransactionIgnored,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['statement_summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const handleOpenEdit = (tx: Transaction) => {
    navigate(`/transactions/${tx.id}/edit`);
  };



  const navigateMonth = (delta: number) => {
    setSearchParams({ month: shiftMonth(monthParam, delta) });
  };

  const selectedMonthLabel = useMemo(() => {
    const [y, m] = monthParam.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    const text = format(date, 'MMMM yyyy', { locale: ptBR });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, [monthParam]);

  const monthResult = (
    parseFloat(summary?.monthly_income_total || '0') -
    parseFloat(summary?.monthly_expense_total || '0')
  );

  const groupedTransactions = useMemo(() => {
    if (!transactions) return [];
    const groups: { date: string; items: Transaction[] }[] = [];
    let lastDate = '';
    for (const tx of transactions) {
      if (tx.date !== lastDate) {
        groups.push({ date: tx.date, items: [] });
        lastDate = tx.date;
      }
      groups[groups.length - 1].items.push(tx);
    }
    return groups;
  }, [transactions]);

  const isRecurringTransaction = (tx: Transaction | null) =>
    Boolean(tx && tx.recurrence_type && tx.recurrence_type !== 'once');

  return (
    <div className="transactions-body animate-fade-in" style={{ padding: '1.5rem 1.25rem 0', minHeight: '100vh' }}>
      <section className="transactions-screen space-y-5">
        
        {/* Nav Month */}
        <div className="txn-month-nav">
          <button className="txn-month-arrow" onClick={() => navigateMonth(-1)} aria-label="Mês anterior">&lsaquo;</button>
          <h1 className="txn-month-title">{selectedMonthLabel}</h1>
          <button className="txn-month-arrow" onClick={() => navigateMonth(1)} aria-label="Mês seguinte">&rsaquo;</button>
        </div>

        {/* Menu de Ações Rápidas */}
        <div ref={menuRef} style={{ position: 'relative', display: 'flex' }}>
          <button className="btn btn-primary" onClick={() => navigate('/transactions/new')}>
            + Nova transação
          </button>
          <button className="btn btn-secondary" style={{ marginLeft: 'var(--space-sm)' }} onClick={() => setShowMenu(!showMenu)}>
            Mais <ChevronDown size={16} />
          </button>
          
          {showMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '0.5rem',
              background: 'var(--color-bg-elevated)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              zIndex: 50,
              minWidth: '200px',
              boxShadow: 'var(--shadow-lg)'
            }}>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { navigate('/accounts'); setShowMenu(false); }}>
                <Wallet size={16} /> Contas
              </button>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { navigate('/categories'); setShowMenu(false); }}>
                <Tags size={16} /> Categorias
              </button>
            </div>
          )}
        </div>
        {/* Balance */}
        <div id="statement-balance">
          <article className="txn-balance-card">
            <div className="txn-balance-grid">
              <div className="txn-balance-item">
                <span className="txn-balance-label">Saldo atual</span>
                <strong className={`txn-balance-value ${parseFloat(summary?.current_balance || '0') < 0 ? 'txn-balance-value-negative' : ''}`}>{formatCurrency(summary?.current_balance || '0')}</strong>
              </div>
              <div className="txn-balance-item">
                <span className="txn-balance-label">Balanço mensal</span>
                <strong className={`txn-balance-value txn-balance-value-month ${parseFloat(summary?.monthly_balance || '0') < 0 ? 'txn-balance-value-negative' : ''}`}>{formatCurrency(summary?.monthly_balance || '0')}</strong>
              </div>
              <div className="txn-balance-item">
                <span className="txn-balance-label">Despesas em aberto</span>
                <strong className="txn-balance-value txn-balance-value-negative">{formatCurrency(summary?.pending_bank_total || '0')}</strong>
              </div>
              <div className="txn-balance-item">
                <span className="txn-balance-label">Cartão em aberto</span>
                <strong className="txn-balance-value txn-balance-value-negative">{formatCurrency(summary?.credit_card_open_total || '0')}</strong>
              </div>
              <div className="txn-balance-item">
                <span className="txn-balance-label">Limite do cartão</span>
                <strong className={`txn-balance-value txn-balance-value-card-limit ${parseFloat(summary?.credit_card_limit || '0') < 0 ? 'txn-balance-value-negative' : ''}`}>{formatCurrency(summary?.credit_card_limit || '0')}</strong>
              </div>
              <div className="txn-balance-item">
                <span className="txn-balance-label">Total cartão</span>
                <strong className="txn-balance-value txn-balance-value-card-total">{formatCurrency(summary?.credit_card_month_total || '0')}</strong>
              </div>
              <div className="txn-balance-item" style={{ gridColumn: 'span 2' }}>
                <span className="txn-balance-label">Balanço consolidado</span>
                <strong className={`txn-balance-value txn-balance-value-consolidated ${parseFloat(summary?.consolidated_balance || '0') < 0 ? 'txn-balance-value-negative' : ''}`}>{formatCurrency(summary?.consolidated_balance || '0')}</strong>
              </div>
            </div>

            <div className="txn-month-totals" aria-label="Totais do mês">
              <p className="txn-month-totals-title">Totais do mês</p>
              <div className="txn-month-totals-grid">
                <div className="txn-month-total-item">
                  <span className="txn-balance-label">Receitas</span>
                  <strong className="txn-month-total-value txn-month-total-income">{formatCurrency(summary?.monthly_income_total || '0')}</strong>
                </div>
                <div className="txn-month-total-item">
                  <span className="txn-balance-label">Despesas</span>
                  <strong className="txn-month-total-value txn-month-total-expense">{formatCurrency(summary?.monthly_expense_total || '0')}</strong>
                </div>
                <div className="txn-month-total-item">
                  <span className="txn-balance-label">Resultado</span>
                  <strong className={`txn-month-total-value ${monthResult < 0 ? 'txn-month-total-expense' : 'txn-month-total-income'}`}>
                    {formatCurrency(monthResult)}
                  </strong>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Search Form */}
        <form className="txn-search-form" onSubmit={(e) => e.preventDefault()}>
          <label className="txn-search-wrap" htmlFor="account-select">
            <span className="txn-search-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M7 14h4"/></svg>
            </span>
            <select 
              id="account-select" 
              className="txn-search-input txn-search-select" 
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="">Todas as contas</option>
              {accounts.map((acc: any) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </label>
          <label className="txn-search-wrap" htmlFor="order-by-select">
            <span className="txn-search-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            </span>
            <select 
              id="order-by-select" 
              className="txn-search-input txn-search-select"
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value)}
            >
              <option value="-date">Mais recentes</option>
              <option value="date">Mais antigas</option>
              <option value="-amount">Maior valor</option>
              <option value="amount">Menor valor</option>
              <option value="is_cleared">Pendentes primeiro</option>
              <option value="-is_cleared">Baixadas primeiro</option>
            </select>
          </label>
        </form>

        {/* Transactions List */}
        <div id="statement-list">
          {isLoading ? (
            <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
              <span className="spinner" />
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <article className="txn-empty-card">
              Nenhuma transação encontrada para os filtros selecionados.
            </article>
          ) : (
            <div className="space-y-4">
              {groupedTransactions.map(group => {
                const groupDate = parseISO(group.date);
                const dayLabel = format(groupDate, "EEEE, d", { locale: ptBR });
                return (
                  <div key={group.date}>
                    <h3 className="txn-day-label">{dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)}</h3>
                    {group.items.map(tx => (
                      <article className="txn-item-row" key={tx.id}>
                        <div className="txn-item-icon-wrap" onClick={() => handleOpenEdit(tx)} style={{ cursor: 'pointer' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="txn-item-icon-svg">
                            <rect x="5" y="3" width="14" height="18" rx="2"></rect>
                            <path d="M9 7h6"></path>
                            <path d="M9 12h6"></path>
                            <path d="M9 16h4"></path>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0" onClick={() => handleOpenEdit(tx)} style={{ cursor: 'pointer' }}>
                          <p className="txn-item-title">{tx.display_title}</p>
                          <p className="txn-item-meta">
                            {tx.category_name || 'Sem categoria'} | {tx.account_name}
                            {tx.is_ignored ? ' | Ignorada' : tx.is_cleared ? ' | Baixada' : ' | Pendente'}
                          </p>
                        </div>
                        <div className="txn-item-right">
                          <p className={`txn-amount ${
                            tx.transaction_type === 'expense' ? 'txn-amount-expense' : 
                            tx.transaction_type === 'income' ? 'txn-amount-income' : 'txn-amount-transfer'
                          } ${tx.is_cleared ? 'txn-amount-cleared' : ''} ${tx.is_ignored ? 'txn-amount-ignored' : ''}`}>
                            {formatCurrency(tx.amount)}
                          </p>
                          <details className="txn-actions-dropdown">
                            <summary className="txn-actions-trigger" aria-label="Ações da transação" title="Ações">
                              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <circle cx="12" cy="5" r="1.8"></circle>
                                <circle cx="12" cy="12" r="1.8"></circle>
                                <circle cx="12" cy="19" r="1.8"></circle>
                              </svg>
                            </summary>
                            <div className="txn-actions-menu">
                              {tx.is_cleared ? (
                                <button type="button" className="txn-menu-item txn-menu-item-clear txn-menu-item-clear-active" onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleMutation.mutate(
                                    { id: tx.id, unlock_password: requestUnlockPassword() },
                                    { onError: (err: any) => alert(err.response?.data?.detail || 'Erro ao atualizar transação.') }
                                  );
                                  document.querySelectorAll('details').forEach(d => d.removeAttribute('open'));
                                }}>
                                  Baixada
                                </button>
                              ) : (
                                <button type="button" className="txn-menu-item txn-menu-item-clear" onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setClearingTx(tx);
                                  document.querySelectorAll('details').forEach(d => d.removeAttribute('open'));
                                }}>
                                  Baixar
                                </button>
                              )}
                              <button type="button" className={`txn-menu-item txn-menu-item-ignore${tx.is_ignored ? ' txn-menu-item-ignore-active' : ''}`} onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                ignoreMutation.mutate(tx.id);
                                document.querySelectorAll('details').forEach(d => d.removeAttribute('open'));
                              }}>
                                {tx.is_ignored ? 'Reativar' : 'Ignorar'}
                              </button>
                              <button type="button" className="txn-menu-item txn-menu-item-edit" onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleOpenEdit(tx);
                                document.querySelectorAll('details').forEach(d => d.removeAttribute('open'));
                              }}>Editar</button>
                              <button type="button" className="txn-menu-item txn-menu-item-delete" onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                document.querySelectorAll('details').forEach(d => d.removeAttribute('open'));
                                setDeletingTx(tx);
                              }}>Excluir</button>
                            </div>
                          </details>
                        </div>
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ClearTransactionModal
        isOpen={!!clearingTx}
        onClose={() => setClearingTx(null)}
        transaction={clearingTx}
        requireUnlockPassword={isMonthClosed}
        onConfirm={async (id, date, unlockPassword) => {
          await toggleMutation.mutateAsync({ id, cleared_date: date, unlock_password: unlockPassword });
        }}
      />

      {deletingTx && createPortal(
        <div
          onClick={() => setDeletingTx(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '1rem',
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 380, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Excluir transação</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.
            </p>
            {isRecurringTransaction(deletingTx) && (
              <div style={{ display: 'grid', gap: '0.65rem', padding: '0.85rem 1rem', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Excluir em:
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  <input
                    type="radio"
                    name="delete-scope"
                    value="current"
                    checked={deleteScope === 'current'}
                    onChange={() => setDeleteScope('current')}
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  Somente esta transacao
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  <input
                    type="radio"
                    name="delete-scope"
                    value="all"
                    checked={deleteScope === 'all'}
                    onChange={() => setDeleteScope('all')}
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  Esta e as proximas recorrencias
                </label>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setDeletingTx(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  let unlockPassword: string | undefined;
                  if (isMonthClosed) {
                    const password = window.prompt('Mes fechado. Informe sua senha para confirmar esta alteracao:');
                    if (password === null) return;
                    unlockPassword = password || undefined;
                  }
                  deleteMutation.mutate({
                    id: deletingTx.id,
                    scope: isRecurringTransaction(deletingTx) ? deleteScope : 'current',
                    unlock_password: unlockPassword,
                  });
                  setDeletingTx(null);
                }}
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {errorModalMessage && createPortal(
        <div
          onClick={() => setErrorModalMessage(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: '1rem',
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Não foi possível concluir</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.55 }}>
              {errorModalMessage}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setErrorModalMessage(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
