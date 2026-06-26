import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line,
} from 'recharts';
import { fetchDashboard } from '../../api/dashboard';

const CHART_COLORS = ['#7abf00', '#60a5fa', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#f472b6'];

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(current: string, delta: number): string {
  const [y, m] = current.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return getMonthParam(d);
}

type Tab = 'categorias' | 'tendencia' | 'ranking';

interface ChartsModalProps {
  initialMonth: string;
  onClose: () => void;
}

export default function ChartsModal({ initialMonth, onClose }: ChartsModalProps) {
  const [tab, setTab] = useState<Tab>('ranking');
  const [month, setMonth] = useState(initialMonth);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-charts', month],
    queryFn: () => fetchDashboard(month),
  });

  const expenseCategories = (data?.expense_by_category ?? []).map((c, i) => ({
    name: c.name,
    value: parseFloat(c.total),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const expenseTrend = (data?.expense_trend ?? []).map((p) => ({
    label: p.label,
    total: parseFloat(p.total),
    isCurrent: p.is_current,
  }));

  const ranking = [...expenseCategories].sort((a, b) => b.value - a.value);
  const rankingTotal = ranking.reduce((s, c) => s + c.value, 0);

  const currentMonth = expenseTrend.find((p) => p.isCurrent);
  const trendAvg = expenseTrend.length ? expenseTrend.reduce((s, p) => s + p.total, 0) / expenseTrend.length : 0;
  const trendPeak = expenseTrend.length ? expenseTrend.reduce((max, p) => p.total > max.total ? p : max, expenseTrend[0]) : null;
  const hasData = expenseTrend.some((p) => p.total > 0);
  const tooltipStyle = { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: '0.8rem' };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 680, width: '95vw', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Gráficos</h2>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
              Leitura visual das despesas por período
            </p>
          </div>
          <button className="btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          {(['ranking', 'tendencia', 'categorias'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 0',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${tab === t ? '#3b82f6' : '#e5e7eb'}`,
                background: tab === t ? '#3b82f6' : '#fff',
                color: tab === t ? '#fff' : '#111',
                fontWeight: 700,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              {t === 'categorias' ? 'Categorias' : t === 'tendencia' ? 'Tendência' : 'Ranking'}
            </button>
          ))}
        </div>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{data?.month_label ?? month}</span>
          <button className="btn btn-ghost btn-icon" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="skeleton" style={{ height: 240 }} />
        ) : tab === 'categorias' ? (
          expenseCategories.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-xl) 0', fontSize: '0.85rem' }}>
              Sem despesas no mês selecionado.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <PieChart width={200} height={200}>
                  <Pie data={expenseCategories} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" stroke="none">
                    {expenseCategories.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                </PieChart>
              </div>
              <div>
                {expenseCategories.map((cat, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.83rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.fill }} />
                      <span style={{ color: 'var(--color-text-secondary)' }}>{cat.name}</span>
                    </div>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(cat.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : tab === 'tendencia' ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 'var(--space-lg)' }}>
              {[
                { label: 'Mês atual', value: formatCurrency(currentMonth?.total ?? 0), sub: 'Sem variação' },
                { label: 'Média', value: formatCurrency(trendAvg), sub: '6 meses' },
                { label: 'Pico', value: formatCurrency(trendPeak?.total ?? 0), sub: trendPeak?.label ?? '-' },
              ].map((card) => (
                <div key={card.label} style={{ background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', padding: '10px 8px', border: '1px solid var(--color-border)', minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{card.label}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.value}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{card.sub}</div>
                </div>
              ))}
            </div>
            {!hasData ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-xl) 0', fontSize: '0.85rem' }}>Sem despesas nos últimos meses.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={expenseTrend} barCategoryGap="25%">
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                    <YAxis hide domain={[0, 'dataMax']} />
                    <Tooltip formatter={(val: any) => formatCurrency(val)} contentStyle={tooltipStyle} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]} minPointSize={3}>
                      {expenseTrend.map((e, i) => <Cell key={i} fill={e.isCurrent ? '#fb7185' : '#2b2f3a'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={expenseTrend}>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                      <YAxis hide />
                      <Tooltip formatter={(val: any) => formatCurrency(val)} contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="total" stroke="#22d3ee" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        ) : (
          ranking.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-xl) 0', fontSize: '0.85rem' }}>
              Sem despesas cadastradas para montar ranking.
            </p>
          ) : (
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Ranking de maiores despesas
              </p>
              {ranking.map((cat, i) => {
                const pct = rankingTotal > 0 ? (cat.value / rankingTotal) * 100 : 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '10px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text-muted)', width: 24, textAlign: 'center' }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>{cat.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                          <span style={{ fontWeight: 700 }}>{formatCurrency(cat.value)}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: cat.fill, width: `${pct}%`, borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>,
    document.body
  );
}
