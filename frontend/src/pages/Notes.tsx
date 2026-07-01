import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, FolderPlus, List, MoreVertical, Pin, PinOff, Plus, Search, StickyNote, Trash2, X } from 'lucide-react';
import {
  createNote,
  createNoteList,
  deleteNote,
  deleteNoteList,
  fetchNoteLists,
  fetchNotes,
  updateNote,
  updateNoteList,
  type Note,
  type NoteList,
  type NotePayload,
} from '../api/notes';

type SelectedList = 'all' | 'unfiled' | number;

const DEFAULT_LIST_COLOR = '#6b7280';

function NoteForm({
  initial,
  lists,
  initialListId,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial?: Partial<Note>;
  lists: NoteList[];
  initialListId: number | null;
  onSubmit: (v: NotePayload) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [noteList, setNoteList] = useState(initial?.note_list ?? initialListId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        onSubmit({
          note_list: noteList || null,
          title: title.trim(),
          content: content.trim(),
        });
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
      <select
        className="input"
        value={noteList ?? ''}
        onChange={(e) => setNoteList(e.target.value ? Number(e.target.value) : null)}
        style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)' }}
      >
        <option value="">Sem lista</option>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>{list.name}</option>
        ))}
      </select>

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

function ListRow({
  label,
  count,
  active,
  onClick,
  onEdit,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const hasActions = Boolean(onEdit || onDelete);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: hasActions ? '18px minmax(0, 1fr) auto auto auto' : '18px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: '0.4rem',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--color-bg-hover)' : 'transparent',
        color: 'var(--color-text-primary)',
        cursor: 'pointer',
        padding: '0.45rem 0.45rem',
        textAlign: 'left',
      }}
    >
      <List size={14} style={{ color: 'var(--color-text-muted)' }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          minWidth: 18,
          borderRadius: 'var(--radius-full)',
          padding: '1px 5px',
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-secondary)',
          fontSize: '0.64rem',
          textAlign: 'center',
        }}
      >
        {count}
      </span>
      {onEdit && (
        <button
          type="button"
          title="Editar lista"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          style={{
            width: 24,
            height: 24,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: active ? 'var(--color-bg-elevated)' : 'transparent',
            color: 'var(--color-text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Edit2 size={13} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          title="Excluir lista"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            width: 24,
            height: 24,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: active ? 'var(--color-bg-elevated)' : 'transparent',
            color: 'var(--color-text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onOpen,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  note: Note;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const openFromCard = (target: EventTarget | null) => {
    if (target instanceof HTMLElement && target.closest('button')) return;
    onOpen();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => openFromCard(e.target)}
      onPointerUp={(e) => openFromCard(e.target)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        position: 'relative',
        height: 152,
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {note.is_pinned && (
        <span style={{ position: 'absolute', top: 8, right: 8, color: 'var(--color-text-muted)' }}>
          <Pin size={13} fill="currentColor" />
        </span>
      )}

      {note.title && (
        <div
          style={{
            fontWeight: 700,
            fontSize: '0.9rem',
            color: 'var(--color-text-primary)',
            paddingRight: note.is_pinned ? '1.2rem' : 0,
            lineHeight: 1.3,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: '1.15rem',
          }}
        >
          {note.title}
        </div>
      )}

      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--color-text-primary)',
          flex: 1,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.45,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: note.title ? 4 : 5,
          WebkitBoxOrient: 'vertical',
          margin: 0,
        }}
      >
        {note.content}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: 'auto', paddingTop: '0.45rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flex: 1 }}>
          {new Date(note.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onTogglePin(); }} title={note.is_pinned ? 'Desafixar' : 'Fixar'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}>
          {note.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}>
          <Edit2 size={14} />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Excluir" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--color-text-muted)' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function Notes() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null);
  const [selectedList, setSelectedList] = useState<SelectedList>('all');
  const [showListForm, setShowListForm] = useState(false);
  const [editingList, setEditingList] = useState<NoteList | null>(null);
  const [listName, setListName] = useState('');
  const [listToDelete, setListToDelete] = useState<NoteList | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => fetchNotes(),
  });

  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['note-lists'],
    queryFn: fetchNoteLists,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notes'] });
    qc.invalidateQueries({ queryKey: ['note-lists'] });
  };

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
    onSuccess: (_data, deletedId) => {
      qc.setQueryData<Note[]>(['notes'], (current = []) => current.filter((note) => note.id !== deletedId));
      setConfirmDelete(null);
      setViewingNote((current) => current?.id === deletedId ? null : current);
      setEditingNote((current) => current?.id === deletedId ? null : current);
      invalidate();
    },
  });

  const createListMutation = useMutation({
    mutationFn: createNoteList,
    onSuccess: (list) => {
      invalidate();
      setSelectedList(list.id);
      setShowListForm(false);
      setEditingList(null);
      setListName('');
    },
  });

  const updateListMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name: string; color: string } }) => updateNoteList(id, payload),
    onSuccess: (list) => {
      invalidate();
      setSelectedList(list.id);
      setShowListForm(false);
      setEditingList(null);
      setListName('');
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: deleteNoteList,
    onSuccess: () => {
      invalidate();
      setSelectedList('all');
      setListToDelete(null);
    },
  });

  const counts = useMemo(() => {
    const byList = new Map<number, number>();
    let unfiled = 0;

    notes.forEach((note) => {
      if (note.note_list) {
        byList.set(note.note_list, (byList.get(note.note_list) ?? 0) + 1);
      } else {
        unfiled += 1;
      }
    });

    return { byList, unfiled, all: notes.length };
  }, [notes]);

  const filtered = notes.filter((note) => {
    if (selectedList === 'unfiled' && note.note_list !== null) return false;
    if (typeof selectedList === 'number' && note.note_list !== selectedList) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      note.title.toLowerCase().includes(q)
      || note.content.toLowerCase().includes(q)
      || (note.note_list_name ?? '').toLowerCase().includes(q)
    );
  });

  const pinned = filtered.filter((note) => note.is_pinned);
  const unpinned = filtered.filter((note) => !note.is_pinned);
  const selectedListObject = typeof selectedList === 'number' ? lists.find((list) => list.id === selectedList) : null;
  const initialListId = typeof selectedList === 'number' ? selectedList : null;
  const selectedListLabel = selectedListObject?.name ?? (selectedList === 'unfiled' ? 'Sem lista' : 'Todas');
  const selectedListCount = selectedListObject
    ? (counts.byList.get(selectedListObject.id) ?? selectedListObject.notes_count ?? 0)
    : selectedList === 'unfiled'
      ? counts.unfiled
      : counts.all;

  const handleEdit = (note: Note) => {
    setEditingNote(note);
    setViewingNote(null);
    setShowForm(false);
  };

  const handleTogglePin = (note: Note) => {
    const isPinned = !note.is_pinned;
    setViewingNote((current) => current?.id === note.id ? { ...current, is_pinned: isPinned } : current);
    updateMutation.mutate({ id: note.id, payload: { is_pinned: isPinned } });
  };

  const handleCreateList = () => {
    const name = listName.trim();
    if (!name) return;
    if (editingList) {
      updateListMutation.mutate({ id: editingList.id, payload: { name, color: DEFAULT_LIST_COLOR } });
    } else {
      createListMutation.mutate({ name, color: DEFAULT_LIST_COLOR });
    }
  };

  const openNewListForm = () => {
    setEditingList(null);
    setListName('');
    setShowListForm(true);
  };

  const openEditListForm = (list: NoteList) => {
    setEditingList(list);
    setListName(list.name);
    setShowListForm(true);
  };

  return (
    <>
      <div
        className="notes-board animate-fade-in"
        style={{
          alignItems: 'start',
        }}
      >
        <aside
          className="notes-sidebar"
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '0.65rem', display: 'grid', gap: '0.15rem' }}>
            <ListRow label="Todas" count={counts.all} active={selectedList === 'all'} onClick={() => setSelectedList('all')} />
            <ListRow label="Sem lista" count={counts.unfiled} active={selectedList === 'unfiled'} onClick={() => setSelectedList('unfiled')} />
            {lists.map((list) => (
              <ListRow
                key={list.id}
                label={list.name}
                count={counts.byList.get(list.id) ?? list.notes_count ?? 0}
                active={selectedList === list.id}
                onClick={() => setSelectedList(list.id)}
                onEdit={() => openEditListForm(list)}
                onDelete={() => setListToDelete(list)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={openNewListForm}
            className="btn btn-ghost"
            style={{
              width: '100%',
              borderTop: '1px solid var(--color-border)',
              borderRadius: 0,
              justifyContent: 'flex-start',
              padding: '0.8rem 0.95rem',
            }}
          >
            <Plus size={17} /> Nova lista
          </button>
        </aside>

        <div style={{ display: 'grid', gap: 'var(--space-lg)', minWidth: 0 }}>
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
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-md)',
              flexWrap: 'wrap',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-card)',
              padding: '0.8rem 0.9rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
              <List size={17} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedListLabel}
                  </span>
                  <span
                    style={{
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--color-bg-elevated)',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.72rem',
                      padding: '1px 7px',
                      flexShrink: 0,
                    }}
                  >
                    {selectedListCount}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              {selectedListObject && (
                <details style={{ position: 'relative', flexShrink: 0 }}>
                  <summary
                    className="btn btn-secondary"
                    title="Ações da lista"
                    style={{
                      height: 36,
                      padding: '0 0.75rem',
                      fontSize: '0.8rem',
                      listStyle: 'none',
                      userSelect: 'none',
                    }}
                  >
                    <MoreVertical size={15} /> Ações
                  </summary>
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 0.35rem)',
                      right: 0,
                      zIndex: 20,
                      minWidth: 168,
                      display: 'grid',
                      gap: 4,
                      padding: 6,
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg-card)',
                      boxShadow: 'var(--shadow-lg)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ justifyContent: 'flex-start', height: 34, padding: '0 0.65rem', fontSize: '0.8rem' }}
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        openEditListForm(selectedListObject);
                      }}
                    >
                      <Edit2 size={14} /> Editar lista
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ justifyContent: 'flex-start', height: 34, padding: '0 0.65rem', fontSize: '0.8rem', color: 'var(--color-danger)' }}
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        setListToDelete(selectedListObject);
                      }}
                    >
                      <Trash2 size={14} /> Excluir lista
                    </button>
                  </div>
                </details>
              )}
              <button
                type="button"
                className="btn btn-primary"
                style={{ height: 36, padding: '0 1rem', fontSize: '0.82rem', flexShrink: 0 }}
                onClick={() => { setShowForm(true); setEditingNote(null); }}
              >
                <Plus size={15} /> Nova anotação
              </button>
            </div>
          </div>

          {showForm && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Nova anotação</h3>
                <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                  <X size={18} />
                </button>
              </div>
              <NoteForm
                lists={lists}
                initialListId={initialListId}
                onSubmit={(value) => createMutation.mutate(value)}
                onCancel={() => setShowForm(false)}
                isLoading={createMutation.isPending}
              />
            </div>
          )}

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
                lists={lists}
                initialListId={editingNote.note_list}
                onSubmit={(value) => updateMutation.mutate({ id: editingNote.id, payload: value })}
                onCancel={() => setEditingNote(null)}
                isLoading={updateMutation.isPending}
              />
            </div>
          )}

          {(isLoading || listsLoading) && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2xl)' }}>
              <span className="spinner" />
            </div>
          )}

          {!isLoading && notes.length === 0 && !showForm && (
            <div className="empty-state">
              <StickyNote className="empty-state-icon" />
              <h3 className="empty-state-title">Nenhuma anotação ainda</h3>
              <p className="empty-state-text">Clique em "Nova anotação" para começar.</p>
            </div>
          )}

          {!isLoading && notes.length > 0 && filtered.length === 0 && (
            <div className="empty-state">
              <Search className="empty-state-icon" />
              <h3 className="empty-state-title">Nenhuma anotação encontrada</h3>
              <p className="empty-state-text">Tente outros termos de busca ou outra lista.</p>
            </div>
          )}

          {pinned.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Pin size={12} /> Fixadas
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 'var(--space-md)', alignItems: 'stretch' }}>
                {pinned.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onOpen={() => setViewingNote(note)}
                    onEdit={() => handleEdit(note)}
                    onDelete={() => { setViewingNote(null); setConfirmDelete(note); }}
                    onTogglePin={() => handleTogglePin(note)}
                  />
                ))}
              </div>
            </div>
          )}

          {unpinned.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
              {pinned.length > 0 && (
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Outras
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 'var(--space-md)', alignItems: 'stretch' }}>
                {unpinned.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onOpen={() => setViewingNote(note)}
                    onEdit={() => handleEdit(note)}
                    onDelete={() => { setViewingNote(null); setConfirmDelete(note); }}
                    onTogglePin={() => handleTogglePin(note)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showListForm && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowListForm(false);
            setEditingList(null);
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingList ? 'Editar lista' : 'Nova lista'}</h3>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => {
                  setShowListForm(false);
                  setEditingList(null);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <input
                className="input"
                placeholder="Nome da lista"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowListForm(false);
                    setEditingList(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!listName.trim() || createListMutation.isPending || updateListMutation.isPending}
                  onClick={handleCreateList}
                >
                  {createListMutation.isPending || updateListMutation.isPending
                    ? <span className="spinner" style={{ width: 16, height: 16 }} />
                    : <><FolderPlus size={15} /> {editingList ? 'Salvar lista' : 'Criar lista'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingNote && (
        <div className="modal-overlay" onClick={() => setViewingNote(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <div style={{ minWidth: 0 }}>
                <h3 className="modal-title" style={{ wordBreak: 'break-word' }}>
                  {viewingNote.title || 'Anotação'}
                </h3>
                <p style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {viewingNote.note_list_name ? `${viewingNote.note_list_name} · ` : ''}
                  {new Date(viewingNote.updated_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setViewingNote(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: '0.95rem', color: 'var(--color-text-primary)', maxHeight: '55vh', overflowY: 'auto', paddingRight: '0.25rem', marginBottom: 'var(--space-lg)', wordBreak: 'break-word' }}>
              {viewingNote.content}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => handleTogglePin(viewingNote)} disabled={updateMutation.isPending}>
                {viewingNote.is_pinned ? <PinOff size={15} /> : <Pin size={15} />}
                {viewingNote.is_pinned ? 'Desafixar' : 'Fixar'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => handleEdit(viewingNote)}>
                <Edit2 size={15} />
                Editar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => { setConfirmDelete(viewingNote); setViewingNote(null); }}>
                <Trash2 size={15} />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button type="button" className="btn btn-danger" onClick={() => deleteMutation.mutate(confirmDelete.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {listToDelete && (
        <div className="modal-overlay" onClick={() => setListToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Excluir lista</h3>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setListToDelete(null)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)', lineHeight: 1.55 }}>
              Excluir a lista "{listToDelete.name}" não apaga as anotações. Elas ficam em "Sem lista".
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setListToDelete(null)}>Cancelar</button>
              <button type="button" className="btn btn-danger" onClick={() => deleteListMutation.mutate(listToDelete.id)} disabled={deleteListMutation.isPending}>
                {deleteListMutation.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Excluir lista'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
