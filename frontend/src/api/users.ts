import api from './client';

export interface PendingUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  tenant_name: string | null;
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
