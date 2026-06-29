import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import * as authApi from '../api/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/auth', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initializes with loading state and attempts to fetch user', async () => {
    (authApi.fetchMe as any).mockResolvedValueOnce({
      user: { id: 1, name: 'Test User' },
      tenant: { id: 1, name: 'Test Tenant' }
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for the fetchMe promise to resolve
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.user?.name).toBe('Test User');
    expect(result.current.tenant?.name).toBe('Test Tenant');
  });

  it('handles failed fetchMe correctly', async () => {
    (authApi.fetchMe as any).mockRejectedValueOnce(new Error('Unauthorized'));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.tenant).toBeNull();
  });

  it('logout function clears state and local storage', async () => {
    (authApi.fetchMe as any).mockResolvedValueOnce({
      user: { id: 1, name: 'Test User' },
      tenant: { id: 1, name: 'Test Tenant' }
    });
    localStorage.setItem('nexo.activeTenantId', '1');

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.logout();
    });

    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.tenant).toBeNull();
    expect(localStorage.getItem('nexo.activeTenantId')).toBeNull();
  });
});
