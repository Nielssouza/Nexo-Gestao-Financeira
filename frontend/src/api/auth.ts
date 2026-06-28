import api from './client';

export interface LoginPayload {
  username: string;
  password: string;
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
  created_at: string;
  role: 'owner' | 'admin' | 'member' | null;
}

export interface MeResponse {
  user: User;
  tenant: Tenant | null;
}

export async function login(payload: LoginPayload): Promise<void> {
  // Tokens are set as httpOnly cookies by the server — nothing stored client-side.
  await api.post('/auth/token/', payload);
}

export async function register(payload: RegisterPayload): Promise<void> {
  await api.post('/auth/register/', payload);
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/me/');
  return data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout/');
  } catch {
    // best-effort: clear cookies server-side even if request fails
  }
  window.location.href = '/login';
}

/** Always returns true — actual auth state is determined by fetchMe() success. */
export function isAuthenticated(): boolean {
  return true;
}
