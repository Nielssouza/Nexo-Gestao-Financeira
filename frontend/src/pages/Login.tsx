import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { login } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const navigate = useNavigate();
  const { refresh, user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Limpa o tenant ativo anterior (de outro usuario que possa ter logado nesta máquina)
    // para não enviar X-Tenant-ID de outro tenant no fetchMe e tomar 403 Forbidden.
    localStorage.removeItem('nexo.activeTenantId');

    try {
      await login({ username, password });
      await refresh();
      setShowSplash(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 2500);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('E-mail ou senha incorretos.');
      } else {
        setError('Erro ao fazer login. Tente novamente.');
      }
      setLoading(false);
    }
  };

  if (showSplash) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} className="animate-fade-in">
        <div style={{ width: 100, height: 100, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-xl)', animation: 'pulse 2s infinite', background: 'white' }}>
           <img src="/icons/icon-512.png" alt="Nexo Logo" style={{ width: 80, height: 80, objectFit: 'contain' }} />
        </div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 'var(--space-sm)', color: 'var(--color-text-primary)' }}>
          Bem-vindo, {user?.first_name || 'Usuário'}!
        </h2>
        <p style={{ color: 'var(--color-text-muted)' }}>Preparando o seu ambiente...</p>
        <div style={{ marginTop: 'var(--space-xl)', width: 200, height: 4, background: 'var(--color-bg-secondary)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--color-accent)', width: '100%', animation: 'progress 2.5s ease-in-out' }} />
        </div>
        <style>{`
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.4); transform: scale(1); }
            50% { box-shadow: 0 0 0 20px rgba(52, 211, 153, 0); transform: scale(1.05); }
            100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); transform: scale(1); }
          }
          @keyframes progress {
            0% { width: 0%; }
            100% { width: 100%; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', paddingTop: '8vh', paddingInline: 'var(--space-lg)' }} className="animate-fade-in">

      {/* Back link */}
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-xl)', textDecoration: 'none' }}>
        <ArrowLeft size={15} /> Voltar
      </Link>

      {/* Title Block */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
          Entrar
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)' }}>
          Entre com o e-mail aprovado no seu cadastro.
        </p>
      </div>

      {/* Info Block */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <p className="label" style={{ marginBottom: '4px' }}>Acesso ao sistema</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Use o e-mail informado no cadastro.
          <br />
          Cadastros novos ficam pendentes até validação do administrador.
        </p>
      </div>

      {/* Form Block */}
      <form onSubmit={handleSubmit} className="card">
        {error && (
          <div
            style={{
              background: 'var(--color-danger-muted)',
              color: 'var(--color-danger)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: 'var(--space-md)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label className="label" htmlFor="username">E-mail</label>
          <input
            id="username"
            className="input"
            type="text"
            placeholder="seu@email.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label className="label" htmlFor="password">Senha</label>
          <input
            id="password"
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : 'Entrar'}
        </button>
      </form>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 'var(--space-xl)' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          Ainda não possui conta?{' '}
          <Link to="/register" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
            Cadastrar
          </Link>
        </p>
      </div>
      
    </div>
  );
}
