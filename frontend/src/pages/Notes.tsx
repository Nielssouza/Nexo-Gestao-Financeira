import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pin, PinOff, Plus, Pencil, Trash2, X, StickyNote, Search } from 'lucide-react';
import {
  createNote,
  deleteNote,
  fetchNotes,
  updateNote,
  type Note,
  type NotePayload,
} from '../api/notes';

// ─── Note Form ────────────────────────────────────────────────────────────────

function NoteForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial?: Partial<Note>;
  onSubmit: (v: NotePayload) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        onSubmit({ title: title.trim(), content: content.trim() });
      }}
      style={{
        display: 'grid',
        gap: '0.85rem',
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        border: '1px solid var(--color-border)',
      }}
    >
      <input
        className="input"
        placeholder="Título (opcional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        style={{
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-primary)',
          fontWeight: 600,
        }}
      />
      <textarea
        className="input"
        placeholder="Escreva sua anotação..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
        rows={4}
        style={{
          resize: 'vertical',
          fontFamily: 'inherit',
          fontSize: '0.9rem',
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-primary)',
        }}
      />
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={isLoading || !content.trim()}>
          {isLoading
            ? <span className="spinner" style={{ width: 16, height: 16 }} />
            : (initial?.id ? 'Salvar' : 'Criar')}
        </button>
      </div>
    </form>
  );
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        position: 'relative',
        minHeight: 120,
      }}
    >
      {note.is_pinned && (
        <span
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: 'var(--color-text-muted)',
          }}
        >
          <Pin size={13} fill="currentColor" />
        </span>
      )}

      {note.title && (
        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text-primary)', paddingRight: note.is_pinned ? '1.2rem' : 0 }}>
          {note.title}
        </div>
      )}

      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--color-text-primary)',
          flex: 1,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.55,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 8,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {note.content}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: `1px solid rgba(0,0,0,0.08)` }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flex: 1 }}>
          {new Date(note.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
        <button
          type="button"
          onClick={onTogglePin}
          title={note.is_pinned ? 'Desafixar' : 'Fixar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}
        >
          {note.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          type="button"
          onClick={onEdit}
          title="Editar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Excluir"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Notes() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => fetchNotes(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notes'] });

  const createMutation = useMutation({
    mutationFn: createNote,
    onSuccess: () => { invalidate(); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<NotePayload> }) => updateNote(id, payload),
    onSuccess: () => { invalidate(); setEditingNote(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => { invalidate(); setConfirmDelete(null); },
  });

  const filtered = notes.filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  });

  const pinned = filtered.filter((n) => n.is_pinned);
  const unpinned = filtered.filter((n) => !n.is_pinned);

  const handleEdit = (note: Note) => { setEditingNote(note); setShowForm(false); };
  const handleTogglePin = (note: Note) => updateMutation.mutate({ id: note.id, payload: { is_pinned: !note.is_pinned } });

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
          <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
          <input
            className="input"
            placeholder="Pesquisar anotações..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2rem', height: 36, fontSize: '0.85rem' }}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ height: 36, padding: '0 1rem', fontSize: '0.82rem', flexShrink: 0 }}
          onClick={() => { setShowForm(true); setEditingNote(null); }}
        >
          <Plus size={15} /> Nova anotação
        </button>
      </div>

      {/* New note form */}
      {showForm && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Nova anotação</h3>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <X size={18} />
            </button>
          </div>
          <NoteForm
            onSubmit={(v) => createMutation.mutate(v)}
            onCancel={() => setShowForm(false)}
            isLoading={createMutation.isPending}
          />
        </div>
      )}

      {/* Edit note form */}
      {editingNote && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Editar anotação</h3>
            <button type="button" onClick={() => setEditingNote(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <X size={18} />
            </button>
          </div>
          <NoteForm
            initial={editingNote}
            onSubmit={(v) => updateMutation.mutate({ id: editingNote.id, payload: v })}
            onCancel={() => setEditingNote(null)}
            isLoading={updateMutation.isPending}
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2xl)' }}>
          <span className="spinner" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && notes.length === 0 && !showForm && (
        <div className="empty-state">
          <StickyNote className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhuma anotação ainda</h3>
          <p className="empty-state-text">Clique em "Nova anotação" para começar.</p>
        </div>
      )}

      {/* No results */}
      {!isLoading && notes.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <Search className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhuma anotação encontrada</h3>
          <p className="empty-state-text">Tente outros termos de busca.</p>
        </div>
      )}

      {/* Pinned section */}
      {pinned.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Pin size={12} /> Fixadas
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-md)', alignItems: 'start' }}>
            {pinned.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => handleEdit(note)}
                onDelete={() => setConfirmDelete(note)}
                onTogglePin={() => handleTogglePin(note)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Unpinned section */}
      {unpinned.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          {pinned.length > 0 && (
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Outras
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-md)', alignItems: 'start' }}>
            {unpinned.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => handleEdit(note)}
                onDelete={() => setConfirmDelete(note)}
                onTogglePin={() => handleTogglePin(note)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Excluir anotação</h3>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)', lineHeight: 1.55 }}>
              Tem certeza que deseja excluir{confirmDelete.title ? ` "${confirmDelete.title}"` : ' esta anotação'}? Essa ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
