import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMe, isAuthenticated, login, logout, register } from './auth';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./client', () => ({
  default: apiMock,
}));

describe('auth api', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    window.history.replaceState({}, '', '/');
  });

  it('stores tokens when login succeeds', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { access: 'access-token', refresh: 'refresh-token' },
    });

    const result = await login({ username: 'user@example.com', password: 'secret' });

    expect(apiMock.post).toHaveBeenCalledWith('/auth/token/', {
      username: 'user@example.com',
      password: 'secret',
    });
    expect(result).toEqual({ access: 'access-token', refresh: 'refresh-token' });
    expect(localStorage.getItem('access_token')).toBe('access-token');
    expect(localStorage.getItem('refresh_token')).toBe('refresh-token');
  });

  it('fetches the authenticated user profile', async () => {
    const profile = {
      user: {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        first_name: '',
        last_name: '',
        is_superuser: true,
      },
      tenant: {
        id: 2,
        name: 'Empresa',
        slug: 'empresa',
        person_type: 'pj',
        person_type_display: 'Pessoa Jurídica',
        role: 'owner',
      },
    };
    apiMock.get.mockResolvedValueOnce({ data: profile });

    await expect(fetchMe()).resolves.toEqual(profile);
    expect(apiMock.get).toHaveBeenCalledWith('/me/');
  });

  it('registers a pending user without storing tokens', async () => {
    apiMock.post.mockResolvedValueOnce({ data: {} });

    await register({
      person_type: 'pf',
      name: 'Pending User',
      document: '000.000.000-00',
      email: 'pending@example.com',
      password: 'Strong-pass-123',
      password_confirm: 'Strong-pass-123',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/auth/register/', {
      person_type: 'pf',
      name: 'Pending User',
      document: '000.000.000-00',
      email: 'pending@example.com',
      password: 'Strong-pass-123',
      password_confirm: 'Strong-pass-123',
    });
    expect(isAuthenticated()).toBe(false);
  });

  it('clears tokens and redirects on logout', () => {
    localStorage.setItem('access_token', 'access-token');
    localStorage.setItem('refresh_token', 'refresh-token');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    logout();

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    consoleError.mockRestore();
  });
});
