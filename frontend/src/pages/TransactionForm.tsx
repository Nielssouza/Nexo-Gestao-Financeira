import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTransactionById, createTransaction, updateTransaction, type CreateTransactionPayload } from '../api/transactions';
import { fetchAccounts } from '../api/accounts';
import { fetchCategories } from '../api/categories';
import { useViewMode } from '../contexts/ViewModeContext';

const GAP = { display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' };

export default function TransactionForm() {
  const { isMobile } = useViewMode();
  const cols2 = isMobile ? '1fr' : '1fr 1fr';
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: rawAccounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const { data: rawCategories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const accounts = Array.isArray(rawAccounts) ? rawAccounts : (rawAccounts as any)?.results ?? [];
  const categories = Array.isArray(rawCategories) ? rawCategories : (rawCategories as any)?.results ?? [];

  const { data: transaction, isLoading: txLoading } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => fetchTransactionById(id!),
    enabled: isEditing,
  });

  const todayStr = new Date().toISOString().split('T')[0];

  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr);
  const [description, setDescription] = useState('');
  const [account, setAccount] = useState<number | string>('');
  const [destinationAccount, setDestinationAccount] = useState<number | string>('');
  const [category, setCategory] = useState<number | string>('');
  const [isCleared, setIsCleared] = useState(true);
  const [isIgnored, setIsIgnored] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'once' | 'monthly' | 'installment'>('once');
  const [installmentCount, setInstallmentCount] = useState<number | string>('');
  const [scope, setScope] = useState<'this' | 'future'>('this');

  useEffect(() => {
    if (transaction) {
      setType(transaction.transaction_type);
      setAmount(transaction.amount);
      setDate(transaction.date);
      setDescription(transaction.description);
      setAccount(transaction.account);
      setDestinationAccount(transaction.destination_account || '');
      setCategory(transaction.category || '');
      setIsCleared(transaction.is_cleared);
      setIsIgnored(transaction.is_ignored);
      setRecurrenceType(transaction.recurrence_type || 'none');
      setInstallmentCount(transaction.installment_count || '');
    } else if (accounts?.length && !account) {
      setAccount(accounts[0].id);
    }
  }, [transaction, accounts]);

  useEffect(() => {
    if (!transaction) setCategory('');
  }, [type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!account) { setError('Selecione uma conta.'); return; }
    if (type === 'transfer' && !destinationAccount) { setError('Selecione a conta de destino.'); return; }
    if (type === 'transfer' && account === destinationAccount) { setError('Conta de origem e destino não podem ser iguais.'); return; }

    setLoading(true);
    try {
      const payload: Partial<CreateTransactionPayload> = {
        transaction_type: type,
        amount,
        date,
        description,
        account: Number(account),
        is_cleared: isCleared,
        is_ignored: isIgnored,
        destination_account: type === 'transfer' ? Number(destinationAccount) : null,
        category: type !== 'transfer' && category ? Number(category) : null,
        recurrence_type: isEditing ? transaction?.recurrence_type : recurrenceType,
        installment_count: recurrenceType === 'installment' && !isEditing ? Number(installmentCount) : null,
        recurrence_interval: 1,
        recurrence_interval_unit: 'month',
      };

      if (isEditing) {
        await updateTransaction(Number(id), { ...payload, scope } as any);
      } else {
        await createTransaction(payload as CreateTransactionPayload);
      }

      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['statement_summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/transactions');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Erro ao salvar transação');
    } finally {
      setLoading(false);
    }
  };

  if (isEditing && txLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 56 }} />)}
      </div>
    );
  }

  const filteredCategories = categories?.filter(c =>
    type === 'expense' ? c.category_type === 'expense' :
    type === 'income' ? c.category_type === 'income' : false
  ) || [];

  const typeColor = type === 'expense' ? 'var(--color-danger)' : type === 'income' ? 'var(--color-success)' : 'var(--color-info)';

  return (
    <div style={GAP}>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">{isEditing ? 'Editar transação' : 'Nova transação'}</h1>
      </div>

      <div className="card" style={GAP}>
        {error && (
          <div style={{ padding: '12px 16px', background: 'var(--color-danger-muted)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Tipo */}
        <div>
          <label className="label">Tipo</label>
          <select
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
            <option value="transfer">Transferência</option>
          </select>
        </div>

        {/* Descrição */}
        <div>
          <label className="label">Descrição</label>
          <input className="input" type="text" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Ex: Mercado, Salário..." />
        </div>

        {/* Valor + Data */}
        <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: '0.75rem' }}>
          <div>
            <label className="label">Valor (R$)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              style={{ color: typeColor, fontWeight: 600 }}
            />
          </div>
          <div>
            <label className="label">Data</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        {/* Conta */}
        <div>
          <label className="label">Conta bancária</label>
          <select className="select" value={account} onChange={(e) => setAccount(e.target.value)} required>
            <option value="">Selecione...</option>
            {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Conta destino (transferência) */}
        {type === 'transfer' && (
          <div>
            <label className="label">Conta destino</label>
            <select className="select" value={destinationAccount} onChange={(e) => setDestinationAccount(e.target.value)} required>
              <option value="">Selecione...</option>
              {accounts?.map(a => (
                <option key={a.id} value={a.id} disabled={a.id.toString() === account.toString()}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Categoria */}
        {type !== 'transfer' && (
          <div>
            <label className="label">Categoria</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Sem categoria</option>
              {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Recorrência */}
        {!isEditing && type !== 'transfer' && (
          <div>
            <label className="label">Recorrência</label>
            <div style={{ display: 'grid', gridTemplateColumns: recurrenceType === 'installment' ? '2fr 1fr' : '1fr', gap: '0.5rem' }}>
              <select className="select" value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value as any)}>
                <option value="once">Única</option>
                <option value="monthly">Recorrente (Mensal)</option>
                <option value="installment">Parcelada (Mensal)</option>
              </select>
              {recurrenceType === 'installment' && (
                <input className="input" type="number" min="2" max="480" placeholder="Parcelas" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} required />
              )}
            </div>
          </div>
        )}

        {/* Checkboxes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={isCleared} onChange={(e) => setIsCleared(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--color-accent)', cursor: 'pointer' }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Efetivado (pago / recebido)</span>
          </label>
        </div>

        {/* Escopo (edição recorrente) */}
        {isEditing && transaction?.recurrence_type && transaction.recurrence_type !== 'none' && (
          <div style={{ padding: '12px 16px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <label className="label" style={{ marginBottom: 10 }}>Aplicar alteração em</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { value: 'this', label: 'Somente nesta transação' },
                { value: 'future', label: 'Nesta e nas próximas' },
              ].map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  <input type="radio" name="scope" value={opt.value} checked={scope === opt.value} onChange={() => setScope(opt.value as any)} style={{ accentColor: 'var(--color-accent)' }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Botões */}
        <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: '0.75rem', paddingTop: '0.5rem' }}>
          <Link to="/transactions" className="btn btn-secondary" style={{ textAlign: 'center', textDecoration: 'none' }}>
            Cancelar
          </Link>
          <button type="submit" className="btn btn-primary" disabled={loading} onClick={handleSubmit}>
            {loading ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
