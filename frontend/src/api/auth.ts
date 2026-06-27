import api from './client';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface TokenResponse {
  access: string;
  refresh: string;
}

export interface RegisterPayload {
  person_type: 'pf' | 'pj';
  name: string;
  document: string;
  email: string;
  password: string;
  password_confirm: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superuser: boolean;
}

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  person_type: 'pf' | 'pj';
  person_type_display: string;
  role: 'owner' | 'admin' | 'member' | null;
}

export interface MeResponse {
  user: User;
  tenant: Tenant | null;
}

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/token/', payload);
  localStorage.setItem('access_token', data.access);
  localStorage.setItem('refresh_token', data.refresh);
  return data;
}

export async function register(payload: RegisterPayload): Promise<void> {
  await api.post('/auth/register/', payload);
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/me/');
  return data;
}

export function logout(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('access_token');
}
