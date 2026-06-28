import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Flag,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  createTodo,
  deleteTodo,
  fetchTodos,
  toggleTodo,
  updateTodo,
  type Priority,
  type TodoItem,
  type TodoStatus,
} from '../api/todos';

const PRIORITY_LABEL: Record<Priority, string> = { low: 'Baixa', medium: 'Media', high: 'Alta' };
const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'var(--color-text-muted)',
  medium: '#f59e0b',
  high: '#ef4444',
};

const STATUS_LABEL: Record<TodoStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  done: 'Finalizado',
};
const STATUS_COLOR: Record<TodoStatus, string> = {
  pending: 'var(--color-warning)',
  in_progress: 'var(--color-info)',
  done: 'var(--color-success)',
};
const STATUSES: TodoStatus[] = ['pending', 'in_progress', 'done'];

type TodoPayload = {
  title: string;
  description: string;
  priority: Priority;
  status: TodoStatus;
  due_date: string | null;
};

function getTodoStatus(item: TodoItem): TodoStatus {
  return item.status ?? (item.is_done ? 'done' : 'pending');
}

function formatDue(iso: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  if (diff < 0) return { label, overdue: true };
  if (diff === 0) return { label: 'Hoje', overdue: false };
  if (diff === 1) return { label: 'Amanha', overdue: false };
  return { label, overdue: false };
}

function TodoForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial?: Partial<TodoItem>;
  onSubmit: (value: TodoPayload) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<TodoStatus>(initial?.status ?? (initial?.is_done ? 'done' : 'pending'));
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      due_date: dueDate || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.85rem' }}>
      <input
        className="input"
        placeholder="Titulo da tarefa *"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
        required
      />
      <textarea
        className="input"
        placeholder="Descricao (opcional)"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
        style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          Status
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value as TodoStatus)}>
            <option value="pending">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="done">Finalizado</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          Prioridade
          <select className="input" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
            <option value="low">Baixa</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          Prazo
          <input type="date" className="input" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={isLoading || !title.trim()}>
          {isLoading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : (initial?.id ? 'Salvar' : 'Adicionar')}
        </button>
      </div>
    </form>
  );
}

function TodoRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: TodoItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const due = formatDue(item.due_date);
  const status = getTodoStatus(item);
  const isDone = status === 'done';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--color-border)', opacity: isDone ? 0.55 : 1 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, flexShrink: 0, color: isDone ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
        title={isDone ? 'Marcar como pendente' : 'Marcar como finalizado'}
      >
        {isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.92rem', textDecoration: isDone ? 'line-through' : 'none' }}>{item.title}</span>
          <span style={{ fontSize: '0.72rem', color: STATUS_COLOR[status], fontWeight: 800 }}>{STATUS_LABEL[status]}</span>
          <span title={PRIORITY_LABEL[item.priority]} style={{ display: 'inline-flex', flexShrink: 0 }}>
            <Flag size={12} style={{ color: PRIORITY_COLOR[item.priority], flexShrink: 0 }} />
          </span>
          {due && (
            <span style={{ fontSize: '0.72rem', color: due.overdue ? '#ef4444' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
              <Calendar size={11} />
              {due.label}
            </span>
          )}
        </div>
        {item.description && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{item.description}</p>}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
        <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-muted)' }} title="Editar">
          <Pencil size={15} />
        </button>
        <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-muted)' }} title="Excluir">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function KanbanCard({
  item,
  onToggle,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  item: TodoItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: TodoStatus) => void;
}) {
  const due = formatDue(item.due_date);
  const status = getTodoStatus(item);
  const isDone = status === 'done';

  return (
    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.85rem', opacity: isDone ? 0.55 : 1, display: 'grid', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <button type="button" onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 1, color: isDone ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
          {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
        </button>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', flex: 1, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4 }}>{item.title}</span>
      </div>
      {item.description && <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: 0, whiteSpace: 'pre-wrap', paddingLeft: '1.5rem' }}>{item.description}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', paddingLeft: '1.5rem' }}>
        <Flag size={12} style={{ color: PRIORITY_COLOR[item.priority] }} />
        {due && (
          <span style={{ fontSize: '0.7rem', color: due.overdue ? '#ef4444' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Calendar size={10} />
            {due.label}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '1.5rem' }}>
        <select className="input" value={status} onChange={(event) => onStatusChange(event.target.value as TodoStatus)} style={{ minHeight: 30, padding: '0.25rem 0.45rem', fontSize: '0.72rem' }}>
          <option value="pending">Pendente</option>
          <option value="in_progress">Em andamento</option>
          <option value="done">Finalizado</option>
        </select>
        <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }} title="Editar">
          <Pencil size={13} />
        </button>
        <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }} title="Excluir">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  items,
  editingId,
  onToggle,
  onEdit,
  onEditSubmit,
  onEditCancel,
  onDelete,
  onStatusChange,
  isUpdating,
}: {
  status: TodoStatus;
  items: TodoItem[];
  editingId: number | null;
  onToggle: (id: number) => void;
  onEdit: (item: TodoItem) => void;
  onEditSubmit: (id: number, value: TodoPayload) => void;
  onEditCancel: () => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: TodoStatus) => void;
  isUpdating: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 0.25rem' }}>
        <Circle size={12} fill="currentColor" style={{ color: STATUS_COLOR[status], flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>{STATUS_LABEL[status]}</span>
        <span style={{ marginLeft: 'auto', background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, padding: '0 0.45rem', lineHeight: '1.5rem', minWidth: '1.5rem', textAlign: 'center' }}>
          {items.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item) =>
          editingId === item.id ? (
            <div key={item.id} className="card" style={{ padding: '0.85rem' }}>
              <TodoForm initial={item} onSubmit={(value) => onEditSubmit(item.id, value)} onCancel={onEditCancel} isLoading={isUpdating} />
            </div>
          ) : (
            <KanbanCard
              key={item.id}
              item={item}
              onToggle={() => onToggle(item.id)}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item.id)}
              onStatusChange={(nextStatus) => onStatusChange(item.id, nextStatus)}
            />
          )
        )}
        {items.length === 0 && (
          <div style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
            Nenhuma tarefa
          </div>
        )}
      </div>
    </div>
  );
}

export default function Todos() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: () => fetchTodos(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['todos'] });

  const createMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => { invalidate(); setShowForm(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateTodo>[1] }) => updateTodo(id, payload),
    onSuccess: () => { invalidate(); setEditingItem(null); },
  });
  const toggleMutation = useMutation({ mutationFn: toggleTodo, onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: deleteTodo, onSuccess: invalidate });

  const filtered = todos.filter((item) => {
    const status = getTodoStatus(item);
    if (filter === 'pending' && status === 'done') return false;
    if (filter === 'done' && status !== 'done') return false;
    if (viewMode === 'list' && priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
    return true;
  });

  const pendingCount = todos.filter((item) => getTodoStatus(item) !== 'done').length;
  const doneCount = todos.filter((item) => getTodoStatus(item) === 'done').length;

  const handleEdit = (item: TodoItem) => {
    setEditingItem(item);
    setShowForm(false);
  };
  const handleEditSubmit = (id: number, value: TodoPayload) => updateMutation.mutate({ id, payload: value });
  const handleStatusChange = (id: number, status: TodoStatus) => updateMutation.mutate({ id, payload: { status } });

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-lg)', maxWidth: viewMode === 'kanban' ? 'none' : 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          <select
            className="input"
            value={filter}
            onChange={(event) => setFilter(event.target.value as 'all' | 'pending' | 'done')}
            aria-label="Filtrar tarefas por status"
            style={{ fontSize: '0.8rem', height: 34, padding: '0.35rem 0.75rem', width: 144 }}
          >
            <option value="all">Todas ({todos.length})</option>
            <option value="pending">Pendentes ({pendingCount})</option>
            <option value="done">Concluidas ({doneCount})</option>
          </select>
          <select className="input" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | 'all')} style={{ fontSize: '0.8rem', height: 34, padding: '0.35rem 0.75rem', width: 150 }}>
            <option value="all">Todas prioridades</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baixa</option>
          </select>

          <select
            className="input"
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as 'list' | 'kanban')}
            aria-label="Selecionar visualizacao"
            style={{ fontSize: '0.8rem', height: 34, padding: '0.35rem 0.75rem', width: 112 }}
          >
            <option value="list">Lista</option>
            <option value="kanban">Kanban</option>
          </select>

          <button type="button" className="btn btn-primary" onClick={() => { setShowForm(true); setEditingItem(null); }} style={{ height: 34, padding: '0.35rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', lineHeight: 1 }}>
            <Plus size={16} /> Nova tarefa
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Nova tarefa</h3>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <X size={18} />
            </button>
          </div>
          <TodoForm onSubmit={(value) => createMutation.mutate(value)} onCancel={() => setShowForm(false)} isLoading={createMutation.isPending} />
        </div>
      )}

      {viewMode === 'list' && (
        <div className="card" style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 'var(--space-2xl)', display: 'flex', justifyContent: 'center' }}><span className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
              <CheckCircle2 className="empty-state-icon" />
              <h3 className="empty-state-title">{todos.length === 0 ? 'Nenhuma tarefa ainda' : 'Nenhuma tarefa encontrada'}</h3>
              {todos.length === 0 && <p className="empty-state-text">Clique em "Nova tarefa" para comecar.</p>}
            </div>
          ) : (
            <div>
              {filtered.map((item) =>
                editingItem?.id === item.id ? (
                  <div key={item.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
                    <TodoForm initial={item} onSubmit={(value) => handleEditSubmit(item.id, value)} onCancel={() => setEditingItem(null)} isLoading={updateMutation.isPending} />
                  </div>
                ) : (
                  <TodoRow key={item.id} item={item} onToggle={() => toggleMutation.mutate(item.id)} onEdit={() => handleEdit(item)} onDelete={() => deleteMutation.mutate(item.id)} />
                )
              )}
            </div>
          )}
        </div>
      )}

      {viewMode === 'kanban' && (
        isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2xl)' }}><span className="spinner" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
            {STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                items={filtered.filter((item) => getTodoStatus(item) === status)}
                editingId={editingItem?.id ?? null}
                onToggle={(id) => toggleMutation.mutate(id)}
                onEdit={handleEdit}
                onEditSubmit={handleEditSubmit}
                onEditCancel={() => setEditingItem(null)}
                onDelete={(id) => deleteMutation.mutate(id)}
                onStatusChange={handleStatusChange}
                isUpdating={updateMutation.isPending}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
