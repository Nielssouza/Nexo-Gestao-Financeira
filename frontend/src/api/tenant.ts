import api from './client';

export interface TenantProfile {
  id: number;
  name: string;
  slug: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  address_number: string;
  address_complement: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  full_address: string;
  logo: string | null;
  created_at: string;
  updated_at: string;
}

export interface CepLookupResult {
  address: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  complement: string;
}

export interface NfseCredential {
  id: number;
  tenant: number;
  gov_br_cpf: string;
  has_password: boolean;
  updated_at: string;
}

export interface TenantCompany {
  id: number;
  tenant: number;
  name: string;
  document: string;
  sequence_number: string;
  email: string;
  phone: string;
  address: string;
  address_number: string;
  address_complement: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  full_address: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchTenantProfile(): Promise<TenantProfile> {
  const { data } = await api.get<TenantProfile>('/tenant/');
  return data;
}

export async function updateTenantProfile(payload: FormData): Promise<TenantProfile> {
  const { data } = await api.patch<TenantProfile>('/tenant/', payload, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

export async function fetchTenantCompanies(): Promise<TenantCompany[]> {
  const { data } = await api.get<any>('/tenant-companies/');
  return data.results !== undefined ? data.results : data;
}

export async function createTenantCompany(payload: Partial<TenantCompany>): Promise<TenantCompany> {
  const { data } = await api.post<TenantCompany>('/tenant-companies/', payload);
  return data;
}

export async function updateTenantCompany(id: number, payload: Partial<TenantCompany>): Promise<TenantCompany> {
  const { data } = await api.patch<TenantCompany>(`/tenant-companies/${id}/`, payload);
  return data;
}

export async function lookupCep(cep: string): Promise<CepLookupResult> {
  const { data } = await api.get<CepLookupResult>(`/cep/${encodeURIComponent(cep)}/`);
  return data;
}

export async function fetchNfseCredentials(): Promise<NfseCredential[]> {
  const { data } = await api.get<any>('/nfse-credentials/');
  return data.results !== undefined ? data.results : data;
}

export async function createNfseCredential(payload: { gov_br_cpf: string; gov_br_password?: string }): Promise<NfseCredential> {
  const { data } = await api.post<NfseCredential>('/nfse-credentials/', payload);
  return data;
}

export async function updateNfseCredential(id: number, payload: { gov_br_cpf?: string; gov_br_password?: string }): Promise<NfseCredential> {
  const { data } = await api.patch<NfseCredential>(`/nfse-credentials/${id}/`, payload);
  return data;
}
