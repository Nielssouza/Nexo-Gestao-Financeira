import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import api from './client';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock window.location
const originalLocation = window.location;

describe('API Client Interceptors', () => {
  let mock: MockAdapter;
  let mockAxios: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(api);
    mockAxios = new MockAdapter(axios);
    localStorage.clear();
    
    // @ts-ignore
    delete window.location;
    window.location = { ...originalLocation, pathname: '/dashboard', href: '' } as any;
  });

  afterEach(() => {
    mock.restore();
    mockAxios.restore();
    window.location = originalLocation;
  });

  it('adds X-Tenant-ID header when activeTenantId is in localStorage', async () => {
    localStorage.setItem('nexo.activeTenantId', '123');
    mock.onGet('/some-endpoint').reply(200, { success: true });

    const response = await api.get('/some-endpoint');

    expect(response.config.headers['X-Tenant-ID']).toBe('123');
  });

  it('does not add X-Tenant-ID header for auth endpoints', async () => {
    localStorage.setItem('nexo.activeTenantId', '123');
    mock.onPost('/auth/token/').reply(200, {});

    const response = await api.post('/auth/token/', {});

    expect(response.config.headers['X-Tenant-ID']).toBeUndefined();
  });

  it('attempts to refresh token on 401 error', async () => {
    // Setup first request to fail with 401, second (retry) to succeed
    mock.onGet('/protected').replyOnce(401);
    mockAxios.onPost().replyOnce(200);
    mock.onGet('/protected').replyOnce(200, { data: 'success' });

    const response = await api.get('/protected');

    expect(response.status).toBe(200);
    expect(response.data.data).toBe('success');
  });

  it('redirects to login on refresh token failure', async () => {
    mock.onGet('/protected').replyOnce(401);
    mockAxios.onPost().replyOnce(401); // Refresh also fails

    try {
      await api.get('/protected');
    } catch (error) {
      // expected to throw
    }

    expect(window.location.href).toBe('/login');
  });
});
