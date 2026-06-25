import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTransactionById, createTransaction, updateTransaction, type CreateTransactionPayload } from '../api/transactions';
import { fetchAccounts } from '../api/accounts';
import { fetchCategories } from '../api/categories';

export default function TransactionForm() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  
  const { data: transaction, isLoading: txLoading } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => fetchTransactionById(id!),
    enabled: isEditing
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // Form state
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr);
  const [description, setDescription] = useState('');
  const [account, setAccount] = useState<number | string>('');
  const [destinationAccount, setDestinationAccount] = useState<number | string>('');
  const [category, setCategory] = useState<number | string>('');
  const [isCleared, setIsCleared] = useState(true);
  const [isIgnored, setIsIgnored] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'none' | 'recurring' | 'installment'>('none');
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
    } else if (accounts?.length) {
      if (!account) setAccount(accounts[0].id);
    }
  }, [transaction, accounts]);

  useEffect(() => {
    if (transaction) return;
    setCategory('');
  }, [type, transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!account) {
      setError('Selecione uma conta.');
      return;
    }

    if (type === 'transfer' && !destinationAccount) {
      setError('Selecione uma conta de destino para a transferência.');
      return;
    }

    if (type === 'transfer' && account === destinationAccount) {
      setError('A conta de origem e destino não podem ser a mesma.');
      return;
    }

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
        recurrence_interval_unit: 'months'
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
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Erro ao salvar transação');
    } finally {
      setLoading(false);
    }
  };

  if (isEditing && txLoading) {
    return <div style={{ padding: '2rem', color: '#fff' }}>Carregando transação...</div>;
  }

  const filteredCategories = categories?.filter(c => type === 'expense' ? c.category_type === 'expense' : type === 'income' ? c.category_type === 'income' : false) || [];

  return (
    <section className="app-page space-y-4" style={{ padding: 'max(1.5rem, env(safe-area-inset-top)) 1.25rem 9rem', minHeight: '100vh', paddingBottom: '9rem' }}>
      <div>
        <h1 className="app-title">{isEditing ? 'Editar transação' : 'Nova transação'}</h1>
        <p className="app-subtitle">Registre receita, despesa ou transferência.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && <div className="app-form-error"><p>{error}</p></div>}

        <div className="space-y-1">
          <label className="app-field-label">Tipo da transação</label>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 16px', border: `1px solid ${type === 'expense' ? 'var(--color-danger)' : 'rgba(100, 116, 139, 0.45)'}`, borderRadius: 'var(--radius-md)', background: type === 'expense' ? 'var(--color-danger-muted)' : 'rgba(15, 23, 42, 0.55)', flex: 1, justifyContent: 'center' }}>
              <input type="radio" name="type" value="expense" checked={type === 'expense'} onChange={() => setType('expense')} style={{ display: 'none' }} />
              <span style={{ fontWeight: type === 'expense' ? 600 : 400, color: type === 'expense' ? 'var(--color-danger)' : '#f1f5f9' }}>Despesa</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 16px', border: `1px solid ${type === 'income' ? 'var(--color-success)' : 'rgba(100, 116, 139, 0.45)'}`, borderRadius: 'var(--radius-md)', background: type === 'income' ? 'var(--color-success-muted)' : 'rgba(15, 23, 42, 0.55)', flex: 1, justifyContent: 'center' }}>
              <input type="radio" name="type" value="income" checked={type === 'income'} onChange={() => setType('income')} style={{ display: 'none' }} />
              <span style={{ fontWeight: type === 'income' ? 600 : 400, color: type === 'income' ? 'var(--color-success)' : '#f1f5f9' }}>Receita</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 16px', border: `1px solid ${type === 'transfer' ? 'var(--color-info)' : 'rgba(100, 116, 139, 0.45)'}`, borderRadius: 'var(--radius-md)', background: type === 'transfer' ? 'var(--color-info-muted)' : 'rgba(15, 23, 42, 0.55)', flex: 1, justifyContent: 'center' }}>
              <input type="radio" name="type" value="transfer" checked={type === 'transfer'} onChange={() => setType('transfer')} style={{ display: 'none' }} />
              <span style={{ fontWeight: type === 'transfer' ? 600 : 400, color: type === 'transfer' ? 'var(--color-info)' : '#f1f5f9' }}>Transf.</span>
            </label>
          </div>
        </div>

        <div className="space-y-1">
          <label className="app-field-label">Descrição</label>
          <input type="text" className="app-input" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div className="space-y-1">
            <label className="app-field-label">Valor (R$)</label>
            <input type="number" step="0.01" min="0.01" className="app-input" value={amount} onChange={(e) => setAmount(e.target.value)} required style={{ color: type === 'expense' ? 'var(--color-danger)' : type === 'income' ? 'var(--color-success)' : 'var(--color-info)', fontWeight: 600 }} />
          </div>
          <div className="space-y-1">
            <label className="app-field-label">Data</label>
            <input type="date" className="app-input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        <div className="space-y-1">
          <label className="app-field-label">Conta bancária</label>
          <select className="app-input" value={account} onChange={(e) => setAccount(e.target.value)} required>
            <option value="">Selecione...</option>
            {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {type === 'transfer' && (
          <div className="space-y-1">
            <label className="app-field-label">Conta destino</label>
            <select className="app-input" value={destinationAccount} onChange={(e) => setDestinationAccount(e.target.value)} required>
              <option value="">Selecione...</option>
              {accounts?.map(a => <option key={a.id} value={a.id} disabled={a.id.toString() === account.toString()}>{a.name}</option>)}
            </select>
          </div>
        )}

        {type !== 'transfer' && (
          <div className="space-y-1">
            <label className="app-field-label">Categoria</label>
            <select className="app-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Selecione...</option>
              {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {!isEditing && type !== 'transfer' && (
          <div className="space-y-1">
            <label className="app-field-label">Recorrência</label>
            <div style={{ display: 'grid', gridTemplateColumns: recurrenceType === 'installment' ? '2fr 1fr' : '1fr', gap: '0.5rem' }}>
              <select className="app-input" value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value as any)}>
                <option value="none">Única</option>
                <option value="recurring">Recorrente (Mensal)</option>
                <option value="installment">Parcelada (Mensal)</option>
              </select>
              {recurrenceType === 'installment' && (
                <input type="number" min="2" max="480" placeholder="Parcelas" className="app-input" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} required />
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" className="app-checkbox" checked={isCleared} onChange={(e) => setIsCleared(e.target.checked)} />
            <span className="app-field-label" style={{ marginBottom: 0 }}>Efetivado (pago/recebido)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" className="app-checkbox" checked={isIgnored} onChange={(e) => setIsIgnored(e.target.checked)} />
            <span className="app-field-label" style={{ marginBottom: 0, opacity: 0.8 }}>Ignorar em gráficos/dashboard</span>
          </label>
        </div>

        {isEditing && transaction?.recurrence_type && transaction.recurrence_type !== 'none' && (
          <div className="space-y-2 rounded-2xl border border-slate-600/50 bg-slate-900/35 p-3" style={{ marginTop: '1rem' }}>
            <p className="app-field-label">Aplicar alteração em</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="radio" name="scope" value="this" checked={scope === 'this'} onChange={() => setScope('this')} />
                <span className="text-sm text-slate-200" style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>Somente nesta transação</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="radio" name="scope" value="future" checked={scope === 'future'} onChange={() => setScope('future')} />
                <span className="text-sm text-slate-200" style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>Nesta e nas próximas transações</span>
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1.5rem' }}>
          <Link to="/transactions" className="app-btn-secondary" style={{ textAlign: 'center', textDecoration: 'none' }}>Cancelar</Link>
          <button type="submit" className="app-btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </section>
  );
}
