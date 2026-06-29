import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';

const authMock = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => authMock);

function renderProtected(requireSuperuser = false) {
  return render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route
          path="/private"
          element={
            <ProtectedRoute requireSuperuser={requireSuperuser}>
              <div>Conteudo protegido</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
        <Route path="/" element={<div>Inicio</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authMock.useAuth.mockReset();
  });

  it('renders a loading spinner while auth state is loading', () => {
    authMock.useAuth.mockReturnValue({
      isLoading: true,
      isLoggedIn: false,
      user: null,
    });

    const { container } = renderProtected();

    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('redirects anonymous users to login', () => {
    authMock.useAuth.mockReturnValue({
      isLoading: false,
      isLoggedIn: false,
      user: null,
    });

    renderProtected();

    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('redirects non-superusers from superuser routes', () => {
    authMock.useAuth.mockReturnValue({
      isLoading: false,
      isLoggedIn: true,
      user: { is_superuser: false },
    });

    renderProtected(true);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders protected content for allowed users', () => {
    authMock.useAuth.mockReturnValue({
      isLoading: false,
      isLoggedIn: true,
      user: { is_superuser: true },
    });

    renderProtected(true);

    expect(screen.getByText('Conteudo protegido')).toBeInTheDocument();
  });
});
