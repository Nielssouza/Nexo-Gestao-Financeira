import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function BottomNav() {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const location = useLocation();

  // Se for Desktop, o CSS vai ocultar essa barra automaticamente usando .txn-bottom-nav { display: none }
  return (
    <nav className="txn-bottom-nav">
      <Link to="/" className={`txn-tab-link ${location.pathname === '/' ? 'txn-tab-active' : ''}`}>
        <span className="txn-tab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
        </span>
        <span>Principal</span>
      </Link>

      <div className="fab-speed-dial">
        <Link to="/transactions/new" className="txn-center-fab" aria-label="Nova transação">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </Link>
      </div>

      <div className="txn-more-menu-wrapper">
        <button 
          type="button" 
          className={`txn-tab-link ${isMoreMenuOpen ? 'txn-tab-active' : ''}`}
          onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
        >
          <span className="txn-tab-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
            </svg>
          </span>
          <span>Menu</span>
        </button>

        {isMoreMenuOpen && (
          <div className="txn-bottom-more-panel">
            <Link to="/transactions" className={`txn-more-link ${location.pathname.startsWith('/transactions') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/></svg></span>
              Financeiro
            </Link>
            <Link to="/invoices" className={`txn-more-link ${location.pathname.startsWith('/invoices') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg></span>
              Faturamento
            </Link>
            <Link to="/investments" className={`txn-more-link ${location.pathname.startsWith('/investments') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 14l4-5 4 3 4-6"/></svg></span>
              Investimentos
            </Link>
            <Link to="/accounts" className={`txn-more-link ${location.pathname.startsWith('/accounts') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg></span>
              Contas
            </Link>
            <Link to="/categories" className={`txn-more-link ${location.pathname.startsWith('/categories') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></span>
              Categorias
            </Link>
            <Link to="/shopping" className={`txn-more-link ${location.pathname.startsWith('/shopping') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 5h2l2.2 10h10.8l2-7H8.2"/><circle cx="10" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg></span>
              Compras
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
