import api from './client';

export interface DashboardKPIs {
  user_balance: string;
  monthly_income: string;
  monthly_expense: string;
  monthly_balance: string;
  credit_available: string;
  investments_total: string;
}

export interface CategoryBreakdown {
  name: string;
  total: string;
}

export interface ExpenseTrendPoint {
  label: string;
  total: string;
  is_current: boolean;
}

export interface AccountSummary {
  id: number;
  name: string;
  account_type: string;
  balance: string;
  include_in_balance: boolean;
}

export interface DueNotificationItem {
  id: number;
  description: string;
  amount: string;
  date: string;
  category: string | null;
  account: string | null;
  overdue: boolean;
}

export interface DueNotifications {
  count: number;
  overdue_count: number;
  items: DueNotificationItem[];
}

export interface DashboardAlerts {
  pending_expense_count: number;
  pending_expense_total: string;
  credit_card_open_count: number;
  credit_card_open_total: string;
  credit_card_month_count: number;
  credit_card_month_total: string;
  credit_card_limit: string;
  consolidated_balance: string;
  balance_after_pending: string;
}

export interface DashboardData {
  selected_month: string;
  month_label: string;
  kpis: DashboardKPIs;
  invoices: {
    total_gross: string;
    count: number;
  };
  expense_by_category: CategoryBreakdown[];
  income_by_category: CategoryBreakdown[];
  expense_trend: ExpenseTrendPoint[];
  accounts: AccountSummary[];
  due_notifications: DueNotifications;
  alerts: DashboardAlerts;
}

export async function fetchDashboard(month?: string): Promise<DashboardData> {
  const params = month ? { month } : {};
  const { data } = await api.get<DashboardData>('/dashboard/', { params });
  return data;
}
