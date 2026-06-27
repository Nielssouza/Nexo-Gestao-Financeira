import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { register } from '../api/auth';

function formatCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export default function Register() {
  const [personType, setPersonType] = useState<'pf' | 'pj'>('pf');
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleDocumentChange = (v: string) => {
    setDocument(personType === 'pf' ? formatCPF(v) : formatCNPJ(v));
  };

  const handlePersonTypeChange = (type: 'pf' | 'pj') => {
    setPersonType(type);
    setDocument('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      await register({
        person_type: personType,
        name,
        document,
        email,
        password,
        password_confirm: passwordConfirm,
      });
      setSuccess(true);
    } catch (err: any) {
      if (err.response?.data) {
        const msgs = Object.values(err.response.data).flat() as string[];
        setError(msgs.join(' '));
      } else {
        setError('Erro ao criar conta. Verifique os dados e tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ maxWidth: 440, margin: '0 auto', paddingTop: '10vh', paddingInline: 'var(--space-lg)' }} className="animate-fade-in">
        <div className="card" style={{ textAlign: 'center', gap: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '3rem' }}>✅</div>
          <h2 style={{ fontWeight: 700 }}>Cadastro enviado!</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Seu cadastro foi recebido e está aguardando validação do administrador.
            Você será notificado assim que o acesso for liberado.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
            Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: '6vh', paddingInline: 'var(--space-lg)', paddingBottom: '2rem' }} className="animate-fade-in">
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-xl)', textDecoration: 'none' }}>
        <ArrowLeft size={15} /> Voltar
      </Link>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Criar conta</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)' }}>
          Preencha os dados para solicitar acesso ao sistema.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {/* PF / PJ toggle */}
        <div>
          <label className="label">Tipo de cadastro</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {(['pf', 'pj'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handlePersonTypeChange(t)}
                className={personType === t ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ fontWeight: 600 }}
              >
                {t === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="label">{personType === 'pf' ? 'Nome completo' : 'Razão Social'}</label>
          <input
            className="input"
            type="text"
            placeholder={personType === 'pf' ? 'João da Silva' : 'Empresa Ltda'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>

        {/* Document */}
        <div>
          <label className="label">{personType === 'pf' ? 'CPF' : 'CNPJ'}</label>
          <input
            className="input"
            type="text"
            placeholder={personType === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
            value={document}
            onChange={(e) => handleDocumentChange(e.target.value)}
            inputMode="numeric"
            required
          />
        </div>



        {/* Email */}
        <div>
          <label className="label">E-mail</label>
          <input
            className="input"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {/* Passwords */}
        <div className="form-amount-date-grid" style={{ gap: '0.75rem' }}>
          <div>
            <label className="label">Senha</label>
            <input
              className="input"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Confirmar senha</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
            />
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Após o cadastro, seu acesso ficará pendente até a validação do administrador.
        </p>

        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Enviar cadastro'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
        <Link to="/login" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Já tem uma conta? <span style={{ color: 'var(--color-accent)' }}>Entrar</span>
        </Link>
      </div>
    </div>
  );
}
