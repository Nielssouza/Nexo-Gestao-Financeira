import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from './Login';
import { AuthProvider } from '../contexts/AuthContext';
import * as authApi from '../api/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  fetchMe: vi.fn(),
}));

const renderLogin = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form', () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/seu@email.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar/i })).toBeInTheDocument();
  });

  it('displays error on failed login', async () => {
    (authApi.login as any).mockRejectedValueOnce(new Error('Invalid credentials'));
    
    renderLogin();
    
    fireEvent.change(screen.getByPlaceholderText(/seu@email.com/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/Erro ao fazer login/i)).toBeInTheDocument();
    });
  });

  it('calls login and refresh on success', async () => {
    (authApi.login as any).mockResolvedValueOnce();
    (authApi.fetchMe as any).mockResolvedValueOnce({ user: { id: 1, name: 'User' }, tenant: { id: 1 } });
    
    renderLogin();
    
    fireEvent.change(screen.getByPlaceholderText(/seu@email.com/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));
    
    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({ username: 'test@example.com', password: 'password' });
    });
  });
});
