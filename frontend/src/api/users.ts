import api from './client';

export interface PendingUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  tenant_id: number | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  person_type: 'pf' | 'pj' | null;
  person_type_display: string | null;
  document: string | null;
}

export interface TenantMember {
  id: number;
  tenant: number;
  tenant_name: string;
  user: number;
  user_email: string;
  user_username: string;
  user_full_name: string;
  role: 'owner' | 'admin' | 'member';
  is_default: boolean;
  allowed_company_ids: number[];
  created_at: string;
  updated_at: string;
}

export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const { data } = await api.get<any>('/users/pending/');
  return data.results !== undefined ? data.results : data;
}

export async function approveUser(id: number): Promise<PendingUser> {
  const { data } = await api.post<PendingUser>(`/users/${id}/approve/`);
  return data;
}

export async function fetchTenantMembers(): Promise<TenantMember[]> {
  const { data } = await api.get<any>('/tenant-memberships/');
  return data.results !== undefined ? data.results : data;
}

export async function updateTenantMemberCompanies(id: number, companyIds: number[]): Promise<TenantMember> {
  const { data } = await api.patch<TenantMember>(`/tenant-memberships/${id}/companies/`, {
    company_ids: companyIds,
  });
  return data;
}

export async function updateTenantMember(
  id: number,
  payload: { name: string; email: string; role: 'owner' | 'admin' | 'member'; password?: string }
): Promise<TenantMember> {
  const { data } = await api.patch<TenantMember>(`/tenant-memberships/${id}/member/`, payload);
  return data;
}

export interface SystemStats {
  total_users: number;
  total_tenants: number;
  total_pf: number;
  total_pj: number;
}

export async function fetchSystemStats(): Promise<SystemStats> {
  const { data } = await api.get<SystemStats>('/system/stats/');
  return data;
}

export interface SystemTenant {
  id: number;
  name: string;
  slug: string;
  person_type: 'pf' | 'pj';
  user_count: number;
  company_count: number;
  created_at: string;
  is_active: boolean;
}

export interface SystemUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  is_active: boolean;
  is_superuser: boolean;
  date_joined: string;
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string;
  person_type: 'pf' | 'pj';
  role: string;
}

export async function fetchSystemTenants(): Promise<SystemTenant[]> {
  const { data } = await api.get<SystemTenant[]>('/system/tenants/');
  return data;
}

export async function fetchSystemUsers(): Promise<SystemUser[]> {
  const { data } = await api.get<SystemUser[]>('/system/users/');
  return data;
}
