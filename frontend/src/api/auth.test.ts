import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMe, login, logout, register } from './auth';

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
  });

  it('calls the login endpoint', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { detail: 'Login realizado com sucesso.' },
    });

    await login({ username: 'user@example.com', password: 'secret' });

    expect(apiMock.post).toHaveBeenCalledWith('/auth/token/', {
      username: 'user@example.com',
      password: 'secret',
    });
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

  it('registers a pending user', async () => {
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
  });

  it('calls logout endpoint and redirects', async () => {
    const originalLocation = window.location;
    // mock window.location.href
    delete (window as any).location;
    window.location = { ...originalLocation, href: '' } as any;

    apiMock.post.mockResolvedValueOnce({});
    await logout();

    expect(apiMock.post).toHaveBeenCalledWith('/auth/logout/');
    expect(window.location.href).toBe('/login');

    // restore
    window.location = originalLocation as any;
  });
});
