import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Flag,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  createProject,
  createTodo,
  deleteTodo,
  deleteProject,
  fetchProjects,
  fetchTenantMembers,
  fetchTodos,
  toggleTodo,
  updateProject,
  updateTodo,
  type Priority,
  type Project,
  type TenantMember,
  type TodoItem,
  type TodoSubtask,
  type TodoStatus,
} from '../api/todos';

// ─── Constants ────────────────────────────────────────────────────────────────


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
  project: number | null;
  parent: number | null;
  assigned_to: number | null;
};

function getTodoStatus(item: TodoItem | TodoSubtask): TodoStatus {
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

function formatPriorityLabel(priority: Priority) {
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baixa';
  return 'Media';
}

function formatMemberLabel(name: string, email: string) {
  return name || email;
}

const DEFAULT_PROJECT_COLOR = '#ffffff';

// ─── Project Form ─────────────────────────────────────────────────────────────

function ProjectForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial?: Partial<Project>;
  onSubmit: (v: { name: string; description: string; color: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const color = DEFAULT_PROJECT_COLOR;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), description: description.trim(), color }); }}
      style={{ display: 'grid', gap: '0.85rem' }}
    >
      <input className="input" placeholder="Nome do projeto *" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      <textarea
        className="input"
        placeholder="Descricao (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }}
      />
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={isLoading || !name.trim()}>
          {isLoading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : (initial?.id ? 'Salvar' : 'Criar projeto')}
        </button>
      </div>
    </form>
  );
}

// ─── Todo Form ────────────────────────────────────────────────────────────────

function TodoForm({
  initial,
  projectId,
  parentId = null,
  members,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial?: Partial<TodoItem>;
  projectId: number | null;
  parentId?: number | null;
  members: TenantMember[];
  onSubmit: (v: TodoPayload) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<TodoStatus>(initial?.status ?? (initial?.is_done ? 'done' : 'pending'));
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '');
  const [assignedTo, setAssignedTo] = useState<number | null>(initial?.assigned_to ?? null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSubmit({
          title: title.trim(),
          description: description.trim(),
          priority,
          status,
          due_date: dueDate || null,
          project: projectId,
          parent: initial?.parent ?? parentId,
          assigned_to: assignedTo,
        });
      }}
      style={{ display: 'grid', gap: '0.85rem' }}
    >
      <input className="input" placeholder="Titulo da tarefa *" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
      <textarea
        className="input"
        placeholder="Descricao (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          Status
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)}>
            <option value="pending">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="done">Finalizado</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          Prioridade
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="low">Baixa</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          Prazo
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        {members.length > 0 && (
          <label style={{ display: 'grid', gap: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            Atribuir a
            <select
              className="input"
              value={assignedTo ?? ''}
              onChange={(e) => setAssignedTo(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Ninguém</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{formatMemberLabel(m.name, m.email)}</option>
              ))}
            </select>
          </label>
        )}
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

function TodoDetailsModal({
  item,
  projectId,
  members,
  onClose,
  onSubmit,
  onDelete,
  onCreateSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  isSaving,
  isDeleting,
  isCreatingSubtask,
  isUpdatingSubtasks,
}: {
  item: TodoItem;
  projectId: number | null;
  members: TenantMember[];
  onClose: () => void;
  onSubmit: (value: TodoPayload) => void;
  onDelete: () => void;
  onCreateSubtask: (title: string) => void;
  onToggleSubtask: (subtaskId: number) => void;
  onDeleteSubtask: (subtaskId: number) => void;
  isSaving: boolean;
  isDeleting: boolean;
  isCreatingSubtask: boolean;
  isUpdatingSubtasks: boolean;
}) {
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const status = getTodoStatus(item);
  const due = formatDue(item.due_date);
  const subtasks = item.subtasks ?? [];

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <h3 className="modal-title" style={{ wordBreak: 'break-word' }}>{item.title}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: STATUS_COLOR[status], fontWeight: 800 }}>{STATUS_LABEL[status]}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                <Flag size={12} style={{ color: PRIORITY_COLOR[item.priority] }} />
                {formatPriorityLabel(item.priority)}
              </span>
              {due && (
                <span style={{ fontSize: '0.72rem', color: due.overdue ? '#ef4444' : 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={12} />
                  {due.label}
                </span>
              )}
              {item.subtask_count > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                  {item.completed_subtask_count}/{item.subtask_count} subtarefas
                </span>
              )}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>

        <TodoForm
          projectId={projectId}
          members={members}
          initial={item}
          onSubmit={onSubmit}
          onCancel={onClose}
          isLoading={isSaving}
        />

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Subtarefas</h4>
              <p style={{ marginTop: 2, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                Quebre esta tarefa em passos menores.
              </p>
            </div>
            {item.subtask_count > 0 && (
              <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                {item.completed_subtask_count} de {item.subtask_count} concluidas
              </span>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const title = subtaskTitle.trim();
              if (!title) return;
              onCreateSubtask(title);
              setSubtaskTitle('');
            }}
            style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}
          >
            <input
              className="input"
              placeholder="Adicionar subtarefa"
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={isCreatingSubtask || !subtaskTitle.trim()}>
              {isCreatingSubtask ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Plus size={15} />}
            </button>
          </form>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {subtasks.length === 0 ? (
              <div style={{ border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                Nenhuma subtarefa criada ainda.
              </div>
            ) : subtasks.map((subtask) => {
              const subtaskStatus = getTodoStatus(subtask);
              const isDone = subtaskStatus === 'done';

              return (
                <div
                  key={subtask.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 0.85rem',
                    opacity: isDone ? 0.62 : 1,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSubtask(subtask.id)}
                    disabled={isUpdatingSubtasks}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1, color: isDone ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                    aria-label={isDone ? 'Reabrir subtarefa' : 'Concluir subtarefa'}
                  >
                    {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', textDecoration: isDone ? 'line-through' : 'none' }}>
                        {subtask.title}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: STATUS_COLOR[subtaskStatus], fontWeight: 800 }}>
                        {STATUS_LABEL[subtaskStatus]}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        <Flag size={11} style={{ color: PRIORITY_COLOR[subtask.priority] }} />
                        {formatPriorityLabel(subtask.priority)}
                      </span>
                    </div>
                    {subtask.description && (
                      <p style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                        {subtask.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteSubtask(subtask.id)}
                    disabled={isUpdatingSubtasks}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}
                    aria-label="Excluir subtarefa"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-danger" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Excluir tarefa'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Todo Row ─────────────────────────────────────────────────────────────────

function TodoRow({ item, onOpen, onToggle, onEdit, onDelete }: {
  item: TodoItem; onOpen: () => void; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const due = formatDue(item.due_date);
  const status = getTodoStatus(item);
  const isDone = status === 'done';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--color-border)', opacity: isDone ? 0.55 : 1, cursor: 'pointer' }}
    >
      <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, flexShrink: 0, color: isDone ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
        {isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.92rem', textDecoration: isDone ? 'line-through' : 'none' }}>{item.title}</span>
          <span style={{ fontSize: '0.72rem', color: STATUS_COLOR[status], fontWeight: 800 }}>{STATUS_LABEL[status]}</span>
          <Flag size={12} style={{ color: PRIORITY_COLOR[item.priority], flexShrink: 0 }} />
          {due && (
            <span style={{ fontSize: '0.72rem', color: due.overdue ? '#ef4444' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
              <Calendar size={11} />{due.label}
            </span>
          )}
          {item.assigned_to_name && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-full)', padding: '1px 7px' }}>
              {item.assigned_to_name[0].toUpperCase()}
              <span>{item.assigned_to_name}</span>
            </span>
          )}
          {item.subtask_count > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {item.completed_subtask_count}/{item.subtask_count} subtarefas
            </span>
          )}
        </div>
        {item.description && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{item.description}</p>}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-muted)' }}><Pencil size={15} /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-muted)' }}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ item, onOpen, onToggle, onEdit, onDelete, onStatusChange }: {
  item: TodoItem; onOpen: () => void; onToggle: () => void; onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: TodoStatus) => void;
}) {
  const due = formatDue(item.due_date);
  const status = getTodoStatus(item);
  const isDone = status === 'done';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.85rem', opacity: isDone ? 0.55 : 1, display: 'grid', gap: '0.5rem', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 1, color: isDone ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
          {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
        </button>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', flex: 1, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4 }}>{item.title}</span>
      </div>
      {item.description && <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: 0, whiteSpace: 'pre-wrap', paddingLeft: '1.5rem' }}>{item.description}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', paddingLeft: '1.5rem' }}>
        <Flag size={12} style={{ color: PRIORITY_COLOR[item.priority] }} />
        {due && (
          <span style={{ fontSize: '0.7rem', color: due.overdue ? '#ef4444' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Calendar size={10} />{due.label}
          </span>
        )}
        {item.subtask_count > 0 && (
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            {item.completed_subtask_count}/{item.subtask_count} subtarefas
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '1.5rem' }}>
        <select className="input" value={status} onClick={(e) => e.stopPropagation()} onChange={(e) => onStatusChange(e.target.value as TodoStatus)} style={{ minHeight: 30, padding: '0.25rem 0.45rem', fontSize: '0.72rem' }}>
          <option value="pending">Pendente</option>
          <option value="in_progress">Em andamento</option>
          <option value="done">Finalizado</option>
        </select>
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}><Pencil size={13} /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ status, items, onOpen, onToggle, onEdit, onDelete, onStatusChange }: {
  status: TodoStatus; items: TodoItem[];
  onOpen: (item: TodoItem) => void; onToggle: (id: number) => void; onEdit: (item: TodoItem) => void;
  onDelete: (id: number) => void; onStatusChange: (id: number, s: TodoStatus) => void;
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
        {items.map((item) => (
          <KanbanCard key={item.id} item={item} onOpen={() => onOpen(item)} onToggle={() => onToggle(item.id)} onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} onStatusChange={(s) => onStatusChange(item.id, s)} />
        ))}
        {items.length === 0 && (
          <div style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
            Nenhuma tarefa
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Task View (inside a project or "no project") ─────────────────────────────

function TaskView({ projectId }: { projectId: number | null }) {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [showForm, setShowForm] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [assignedFilter, setAssignedFilter] = useState<number | 'all'>('all');

  const { data: members = [] } = useQuery({
    queryKey: ['tenant-members'],
    queryFn: fetchTenantMembers,
    staleTime: 5 * 60 * 1000,
  });

  const queryParams = {
    ...(projectId !== null ? { project: projectId } : { project: '' as const }),
    ...(assignedFilter !== 'all' ? { assigned_to: assignedFilter } : {}),
  };
  const { data: todos = [], isLoading } = useQuery({
    queryKey: ['todos', projectId, assignedFilter],
    queryFn: () => fetchTodos(queryParams),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['todos'] });
    qc.invalidateQueries({ queryKey: ['todo-projects'] });
  };

  const createMutation = useMutation({ mutationFn: createTodo, onSuccess: () => { invalidate(); setShowForm(false); } });
  const createSubtaskMutation = useMutation({ mutationFn: createTodo, onSuccess: invalidate });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateTodo>[1] }) => updateTodo(id, payload),
    onSuccess: () => { invalidate(); setSelectedItemId(null); },
  });
  const toggleMutation = useMutation({ mutationFn: toggleTodo, onSuccess: invalidate });
  const toggleSubtaskMutation = useMutation({ mutationFn: toggleTodo, onSuccess: invalidate });
  const deleteMutation = useMutation({
    mutationFn: deleteTodo,
    onSuccess: (_, deletedId) => {
      invalidate();
      setSelectedItemId((current) => current === deletedId ? null : current);
    },
  });
  const deleteSubtaskMutation = useMutation({ mutationFn: deleteTodo, onSuccess: invalidate });

  const filtered = todos.filter((item) => {
    const status = getTodoStatus(item);
    if (filter === 'pending' && status === 'done') return false;
    if (filter === 'done' && status !== 'done') return false;
    if (viewMode === 'list' && priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
    return true;
  });

  const pendingCount = todos.filter((t) => getTodoStatus(t) !== 'done').length;
  const doneCount = todos.filter((t) => getTodoStatus(t) === 'done').length;
  const selectedItem = selectedItemId === null ? null : todos.find((item) => item.id === selectedItemId) ?? null;

  const handleEdit = (item: TodoItem) => { setSelectedItemId(item.id); setShowForm(false); };
  const handleOpen = (item: TodoItem) => { setSelectedItemId(item.id); setShowForm(false); };
  const handleEditSubmit = (id: number, value: TodoPayload) => updateMutation.mutate({ id, payload: value });
  const handleStatusChange = (id: number, status: TodoStatus) => updateMutation.mutate({ id, payload: { status } });

  const accentColor = DEFAULT_PROJECT_COLOR;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'center' }}>
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'pending' | 'done')} style={{ flex: '1 1 120px', minWidth: 0, height: 34, padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
          <option value="all">Todas ({todos.length})</option>
          <option value="pending">Pendentes ({pendingCount})</option>
          <option value="done">Concluidas ({doneCount})</option>
        </select>
        <select className="input" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')} style={{ flex: '1 1 120px', minWidth: 0, height: 34, padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
          <option value="all">Todas prioridades</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baixa</option>
        </select>
        <select className="input" value={assignedFilter === 'all' ? 'all' : String(assignedFilter)} onChange={(e) => setAssignedFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ flex: '1 1 160px', minWidth: 0, height: 34, padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
          <option value="all">Todos usuarios</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{formatMemberLabel(member.name, member.email)}</option>
          ))}
        </select>
        <select className="input" value={viewMode} onChange={(e) => setViewMode(e.target.value as 'list' | 'kanban')} style={{ flex: '1 1 100px', minWidth: 0, height: 34, padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
          <option value="list">Lista</option>
          <option value="kanban">Kanban</option>
        </select>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setSelectedItemId(null); }}
          style={{ height: 34, padding: '0 1rem', fontSize: '0.8rem', background: accentColor, color: accentColor === '#ffffff' ? '#000' : undefined, flexShrink: 0 }}
        >
          <Plus size={15} /> Nova tarefa
        </button>
      </div>

      {/* New task form */}
      {showForm && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Nova tarefa</h3>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
          </div>
          <TodoForm projectId={projectId} members={members} onSubmit={(v) => createMutation.mutate(v)} onCancel={() => setShowForm(false)} isLoading={createMutation.isPending} />
        </div>
      )}

      {/* List */}
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
              {filtered.map((item) => (
                <TodoRow key={item.id} item={item} onOpen={() => handleOpen(item)} onToggle={() => toggleMutation.mutate(item.id)} onEdit={() => handleEdit(item)} onDelete={() => deleteMutation.mutate(item.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kanban */}
      {viewMode === 'kanban' && (
        isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2xl)' }}><span className="spinner" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
            {STATUSES.map((s) => (
              <KanbanColumn
                key={s}
                status={s}
                items={filtered.filter((item) => getTodoStatus(item) === s)}
                onOpen={handleOpen}
                onToggle={(id) => toggleMutation.mutate(id)}
                onEdit={handleEdit}
                onDelete={(id) => deleteMutation.mutate(id)}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )
      )}

      {selectedItem && (
        <TodoDetailsModal
          key={selectedItem.id}
          item={selectedItem}
          projectId={projectId}
          members={members}
          onClose={() => setSelectedItemId(null)}
          onSubmit={(value) => handleEditSubmit(selectedItem.id, value)}
          onDelete={() => deleteMutation.mutate(selectedItem.id)}
          onCreateSubtask={(title) => createSubtaskMutation.mutate({
            title,
            description: '',
            priority: 'medium',
            status: 'pending',
            due_date: null,
            project: selectedItem.project ?? projectId,
            parent: selectedItem.id,
            assigned_to: null,
          })}
          onToggleSubtask={(subtaskId) => toggleSubtaskMutation.mutate(subtaskId)}
          onDeleteSubtask={(subtaskId) => deleteSubtaskMutation.mutate(subtaskId)}
          isSaving={updateMutation.isPending}
          isDeleting={deleteMutation.isPending}
          isCreatingSubtask={createSubtaskMutation.isPending}
          isUpdatingSubtasks={toggleSubtaskMutation.isPending || deleteSubtaskMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Projects List (home) ─────────────────────────────────────────────────────

function ProjectsList({
  projects,
  isLoading,
  onSelect,
}: {
  projects: Project[];
  isLoading: boolean;
  onSelect: (p: Project | null) => void;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [showFinished, setShowFinished] = useState(false);

  const invalidateProjects = () => qc.invalidateQueries({ queryKey: ['todo-projects'] });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => { invalidateProjects(); setShowForm(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateProject>[1] }) => updateProject(id, payload),
    onSuccess: () => { invalidateProjects(); setEditingProject(null); },
  });
  const finishMutation = useMutation({
    mutationFn: (id: number) => updateProject(id, { is_finished: true }),
    onSuccess: invalidateProjects,
  });
  const restoreMutation = useMutation({
    mutationFn: (id: number) => updateProject(id, { is_finished: false }),
    onSuccess: invalidateProjects,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => { invalidateProjects(); setConfirmDelete(null); },
  });

  const active = projects.filter((p) => !p.is_finished);
  const finished = projects.filter((p) => p.is_finished);

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Projetos</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            style={{ height: 34, padding: '0 0.85rem', fontSize: '0.82rem', gap: '0.4rem' }}
            onClick={() => setShowFinished(true)}
          >
            <Archive size={14} />
            Finalizados
            {finished.length > 0 && (
              <span style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, padding: '0 0.4rem', lineHeight: '1.4rem', minWidth: '1.4rem', textAlign: 'center' }}>
                {finished.length}
              </span>
            )}
          </button>
          <button type="button" className="btn btn-primary" style={{ height: 34, padding: '0 1rem', fontSize: '0.82rem' }} onClick={() => { setShowForm(true); setEditingProject(null); }}>
            <Plus size={15} /> Novo projeto
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Novo projeto</h3>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
          </div>
          <ProjectForm onSubmit={(p) => createMutation.mutate(p)} onCancel={() => setShowForm(false)} isLoading={createMutation.isPending} />
        </div>
      )}

      {editingProject && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Editar projeto</h3>
            <button type="button" onClick={() => setEditingProject(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
          </div>
          <ProjectForm initial={editingProject} onSubmit={(p) => updateMutation.mutate({ id: editingProject.id, payload: p })} onCancel={() => setEditingProject(null)} isLoading={updateMutation.isPending} />
        </div>
      )}

      {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}><span className="spinner" /></div>}

      {!isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-md)' }}>
          {active.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              {/* Color bar */}
              <div style={{ height: 4, background: DEFAULT_PROJECT_COLOR }} />
              <button
                type="button"
                onClick={() => onSelect(p)}
                style={{ flex: 1, padding: '1rem 1.25rem 0.85rem', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <FolderOpen size={15} style={{ color: DEFAULT_PROJECT_COLOR, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </div>
                {p.description && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.description}
                  </span>
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {p.todo_count > 0 ? `${p.todo_count} tarefa${p.todo_count !== 1 ? 's' : ''} abertas` : 'Nenhuma tarefa aberta'}
                </span>
              </button>
              <div style={{ display: 'flex', gap: 4, padding: '0.55rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                <button type="button" onClick={() => { setEditingProject(p); setShowForm(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', color: 'var(--color-text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Pencil size={12} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => finishMutation.mutate(p.id)}
                  disabled={finishMutation.isPending}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', color: 'var(--color-text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Archive size={12} /> Finalizar
                </button>
                <button type="button" onClick={() => setConfirmDelete(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', color: 'var(--color-text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && active.length === 0 && !showForm && (
        <div className="empty-state">
          <FolderOpen className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum projeto ativo</h3>
          <p className="empty-state-text">
            {finished.length > 0
              ? 'Todos os projetos foram finalizados.'
              : 'Crie um projeto para organizar suas tarefas.'}
          </p>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && createPortal(
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Excluir projeto</h3>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: DEFAULT_PROJECT_COLOR, flexShrink: 0 }} />
              <span style={{ fontWeight: 700 }}>{confirmDelete.name}</span>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)', lineHeight: 1.55 }}>
              Tem certeza que deseja excluir este projeto? As tarefas vinculadas não serão excluídas, mas perderão a associação com o projeto.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button type="button" className="btn btn-danger" onClick={() => deleteMutation.mutate(confirmDelete.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Finished projects modal */}
      {showFinished && createPortal(
        <div className="modal-overlay" onClick={() => setShowFinished(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <Archive size={18} style={{ color: 'var(--color-text-muted)' }} />
                <h3 className="modal-title">Projetos finalizados</h3>
                <span style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, padding: '0 0.45rem', lineHeight: '1.5rem' }}>
                  {finished.length}
                </span>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowFinished(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.25rem' }}>
              {finished.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
                  <Archive className="empty-state-icon" />
                  <h3 className="empty-state-title">Nenhum projeto finalizado</h3>
                </div>
              ) : finished.map((p) => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}
                >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: DEFAULT_PROJECT_COLOR, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.75 }}>{p.name}</div>
                    {p.finished_at && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                        Finalizado em {new Date(p.finished_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ height: 30, padding: '0 0.65rem', fontSize: '0.75rem', gap: '0.3rem' }}
                      onClick={() => restoreMutation.mutate(p.id)}
                      disabled={restoreMutation.isPending}
                      title="Restaurar projeto"
                    >
                      <RotateCcw size={12} /> Restaurar
                    </button>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', color: 'var(--color-text-muted)' }}
                      onClick={() => { setConfirmDelete(p); setShowFinished(false); }}
                      title="Excluir projeto"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Todos() {
  const [activeProject, setActiveProject] = useState<Project | null | 'home'>('home');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['todo-projects'],
    queryFn: fetchProjects,
  });

  // "home" = projects list; null = tasks without project; Project = tasks inside that project
  if (activeProject === 'home') {
    return (
      <ProjectsList
        projects={projects}
        isLoading={projectsLoading}
        onSelect={(p) => setActiveProject(p)}
      />
    );
  }

  const color = DEFAULT_PROJECT_COLOR;
  const label = activeProject ? activeProject.name : 'Sem projeto';

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {/* Project header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={() => setActiveProject('home')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
          title="Voltar para projetos"
        >
          <ArrowLeft size={20} />
        </button>
        {color && <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{label}</h2>
        {activeProject?.description && (
          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>— {activeProject.description}</span>
        )}
      </div>

      <TaskView projectId={activeProject?.id ?? null} />
    </div>
  );
}
