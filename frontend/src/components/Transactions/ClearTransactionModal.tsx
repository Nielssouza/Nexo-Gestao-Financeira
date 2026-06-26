import { useState, useEffect } from 'react';
import { type Transaction } from '../../api/transactions';

interface ClearTransactionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: number, date: string, unlockPassword?: string) => Promise<void>;
  requireUnlockPassword?: boolean;
}

export default function ClearTransactionModal({ transaction, isOpen, onClose, onConfirm, requireUnlockPassword = false }: ClearTransactionModalProps) {
  const [clearedDate, setClearedDate] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (transaction) {
      setClearedDate(transaction.date || new Date().toISOString().split('T')[0]);
      setUnlockPassword('');
    }
  }, [transaction]);

  if (!isOpen || !transaction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await onConfirm(transaction.id, clearedDate, unlockPassword || undefined);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Erro ao baixar transação');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: string | number) => {
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="app-modal-content clear-modal">
        <div className="clear-modal-head">
          <div>
            <p className="clear-modal-kicker">Baixar transacao</p>
            <h3 className="clear-modal-title">{transaction.display_title || transaction.description || 'Sem descrição'}</h3>
          </div>
          <button type="button" onClick={onClose} className="clear-modal-close" aria-label="Fechar modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M18 6L6 18"></path>
              <path d="M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div className="clear-modal-summary">
          <span>{transaction.account_name}</span>
          <strong style={{ color: transaction.transaction_type === 'income' ? '#86efac' : '#fda4af' }}>
            {formatCurrency(transaction.amount)}
          </strong>
        </div>

        <form onSubmit={handleSubmit} className="clear-modal-form">
          <label className="clear-modal-label" htmlFor={`modal-cleared-date-${transaction.id}`}>Data da baixa</label>
          <input
            id={`modal-cleared-date-${transaction.id}`}
            className="clear-modal-date"
            type="date"
            required
            autoFocus
            value={clearedDate}
            onChange={(e) => setClearedDate(e.target.value)}
          />

          {requireUnlockPassword && (
            <>
              <label className="clear-modal-label" htmlFor={`modal-unlock-password-${transaction.id}`}>Senha para mês fechado</label>
              <input
                id={`modal-unlock-password-${transaction.id}`}
                className="clear-modal-date"
                type="password"
                required
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
              />
            </>
          )}

          <button type="submit" className="clear-modal-submit" disabled={loading}>
            {loading ? 'Aguarde...' : 'Confirmar baixa'}
          </button>
        </form>
      </div>
    </div>
  );
}
