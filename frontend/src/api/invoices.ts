import api from './client';
import type { TenantProfile } from './tenant';

export interface Client {
  id: number;
  name: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  number: number;
  number_display: string;
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  issue_date: string;
  due_date: string;
  client_name: string;
  client_document: string;
  client_email: string;
  client_phone: string;
  client_address: string;
  client_city: string;
  service_code: string;
  service_code_description: string;
  service_description: string;
  gross_value: string;
  deductions: string;
  calculation_base: string;
  iss_rate: string;
  iss_withheld: boolean;
  pis_rate: string;
  cofins_rate: string;
  csll_rate: string;
  ir_rate: string;
  inss_rate: string;
  iss_value: string;
  pis_value: string;
  cofins_value: string;
  csll_value: string;
  ir_value: string;
  inss_value: string;
  total_withheld: string;
  net_value: string;
  recurrence_type: 'once' | 'fixed' | 'monthly' | 'quarterly' | 'yearly' | 'installment';
  recurrence_interval: number;
  recurrence_interval_unit: 'day' | 'month' | 'year';
  installment_count: number | null;
  expected_account: number | null;
  expected_account_name: string;
  nfse_status: 'nfse_pending' | 'nfse_processing' | 'nfse_issued' | 'nfse_failed' | null;
  nfse_number: string | null;
  nfse_error: string | null;
  nfse_requested_at: string | null;
  paid_at: string | null;
  transaction: number | null;
  notes: string;
  created_at: string;
}

export type CreateInvoicePayload = Partial<Invoice> & { launch_financial?: boolean; save_client?: boolean };

export interface InvoicePrintData {
  invoice: Invoice;
  tenant: TenantProfile | null;
  service_code_description: string;
}

export interface InvoiceNfseGuide {
  invoice: Invoice;
  service_code_description: string;
  portal_url: string;
  fields: {
    client: Record<string, string>;
    service: Record<string, string>;
    values: Record<string, string | boolean>;
  };
}

export interface InvoiceNfseStatus {
  nfse_status: Invoice['nfse_status'];
  nfse_error: string | null;
  nfse_requested_at: string | null;
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data } = await api.get<Invoice[]>('/invoices/');
  return data;
}

export async function fetchInvoice(id: number): Promise<Invoice> {
  const { data } = await api.get<Invoice>(`/invoices/${id}/`);
  return data;
}

export async function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
  const { data } = await api.post<Invoice>('/invoices/', payload);
  return data;
}

export async function updateInvoice(id: number, payload: Partial<CreateInvoicePayload>): Promise<Invoice> {
  const { data } = await api.patch<Invoice>(`/invoices/${id}/`, payload);
  return data;
}

export async function deleteInvoice(id: number): Promise<void> {
  await api.delete(`/invoices/${id}/`);
}

export async function payInvoice(id: number, payload: { paid_at: string; account?: number | null; launch_financial?: boolean }): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/${id}/pay/`, payload);
  return data;
}

export async function cancelInvoice(id: number): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/${id}/cancel/`);
  return data;
}

export async function fetchClients(): Promise<Client[]> {
  const { data } = await api.get<Client[]>('/clients/');
  return data;
}

export async function fetchInvoicePrintData(id: number): Promise<InvoicePrintData> {
  const { data } = await api.get<InvoicePrintData>(`/invoices/${id}/print_data/`);
  return data;
}

export async function fetchInvoiceNfseGuide(id: number): Promise<InvoiceNfseGuide> {
  const { data } = await api.get<InvoiceNfseGuide>(`/invoices/${id}/nfse_guide/`);
  return data;
}

export async function emitInvoiceNfse(id: number): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/${id}/nfse_emit/`);
  return data;
}

export async function fetchInvoiceNfseStatus(id: number): Promise<InvoiceNfseStatus> {
  const { data } = await api.get<InvoiceNfseStatus>(`/invoices/${id}/nfse_status/`);
  return data;
}
