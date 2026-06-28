import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send httpOnly auth cookies automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach active tenant header
api.interceptors.request.use((config) => {
  const activeTenantId = localStorage.getItem('nexo.activeTenantId');
  const url = config.url || '';
  const isAuthRequest = url.includes('/auth/token') || url.includes('/auth/register');
  if (activeTenantId && config.headers && !isAuthRequest) {
    config.headers['X-Tenant-ID'] = activeTenantId;
  }
  if (config.headers && !isAuthRequest) {
    config.headers['Cache-Control'] = 'no-store';
    config.headers.Pragma = 'no-cache';
  }
  return config;
});

const PUBLIC_PATHS = ['/', '/login', '/register'];

// Response interceptor: auto-refresh token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const onPublicPage = PUBLIC_PATHS.includes(window.location.pathname);

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('auth/token') &&
      !onPublicPage
    ) {
      originalRequest._retry = true;

      try {
        // Refresh token is in httpOnly cookie — sent automatically with withCredentials
        await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {}, { withCredentials: true });
        return api(originalRequest);
      } catch {
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
