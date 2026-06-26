import api from './client';

export interface Transaction {
  id: number;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: string;
  date: string;
  account: number;
  account_name: string;
  destination_account: number | null;
  destination_account_name: string;
  category: number | null;
  category_name: string;
  description: string;
  is_cleared: boolean;
  is_ignored: boolean;
  recurrence_type: 'once' | 'fixed' | 'monthly' | 'quarterly' | 'yearly' | 'installment';
  recurrence_interval: number;
  recurrence_interval_unit: 'day' | 'month' | 'year';
  installment_count: number | null;
  installment_number: number | null;
  display_title: string;
  created_at: string;
}

export async function fetchTransactionById(id: number | string): Promise<Transaction> {
  const { data } = await api.get<Transaction>(`/transactions/${id}/`);
  return data;
}

export type CreateTransactionPayload = Omit<
  Transaction, 
  'id' | 'account_name' | 'destination_account_name' | 'category_name' | 'display_title' | 'installment_number' | 'created_at'
>;

export interface StatementSummary {
  current_balance: string;
  monthly_balance: string;
  credit_card_open_total: string;
  credit_card_month_total: string;
  credit_card_limit: string;
  consolidated_balance: string;
  pending_bank_total: string;
  monthly_income_total: string;
  monthly_expense_total: string;
}

export interface ClosedMonth {
  id: number;
  year: number;
  month: number;
  is_closed: boolean;
  closed_at: string;
  updated_at: string;
}

export async function fetchTransactions(params?: { date__gte?: string; date__lte?: string; account?: string; category?: string; order_by?: string }): Promise<Transaction[]> {
  const { data } = await api.get<any>('/transactions/', { params });
  return data.results !== undefined ? data.results : data;
}

export async function fetchStatementSummary(params?: { month?: string; account?: string; category?: string }): Promise<StatementSummary> {
  const { data } = await api.get<StatementSummary>('/transactions/statement_summary/', { params });
  return data;
}

export async function createTransaction(payload: CreateTransactionPayload): Promise<Transaction> {
  const { data } = await api.post<Transaction>('/transactions/', payload);
  return data;
}

export async function updateTransaction(id: number, payload: Partial<CreateTransactionPayload>): Promise<Transaction> {
  const { data } = await api.patch<Transaction>(`/transactions/${id}/`, payload);
  return data;
}

export async function deleteTransaction({ id, unlock_password, scope = 'current' }: { id: number; unlock_password?: string; scope?: 'current' | 'all' }): Promise<void> {
  await api.delete(`/transactions/${id}/`, { data: { unlock_password, scope } });
}

export async function toggleTransactionCleared({ id, cleared_date, unlock_password }: { id: number, cleared_date?: string, unlock_password?: string }): Promise<Transaction> {
  const { data } = await api.post<Transaction>(`/transactions/${id}/toggle_cleared/`, { cleared_date, unlock_password });
  return data;
}

export async function toggleTransactionIgnored(id: number): Promise<Transaction> {
  const { data } = await api.post<Transaction>(`/transactions/${id}/toggle_ignored/`);
  return data;
}

export async function fetchClosedMonths(params?: { year?: number; month?: number; is_closed?: boolean }): Promise<ClosedMonth[]> {
  const { data } = await api.get<any>('/closed-months/', { params });
  return data.results !== undefined ? data.results : data;
}

export async function createClosedMonth(payload: { year: number; month: number; is_closed?: boolean }): Promise<ClosedMonth> {
  const { data } = await api.post<ClosedMonth>('/closed-months/', payload);
  return data;
}

export async function updateClosedMonth(id: number, payload: Partial<Pick<ClosedMonth, 'is_closed'>>): Promise<ClosedMonth> {
  const { data } = await api.patch<ClosedMonth>(`/closed-months/${id}/`, payload);
  return data;
}
