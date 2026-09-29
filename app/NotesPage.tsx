'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Table2, Plus, X, ArrowLeft, Save } from 'lucide-react';
import { NOTE_LIMITS, NoteTable, parseNoteTable, sanitizeNoteData } from '@/lib/farm-notes';

type Note = { id: string; title: string; data: Record<string, string>; updated_at: string };
type Draft = { id?: string; title: string; noteType: 'text' | 'table'; content: string; table: NoteTable };
const blankTable = (): NoteTable => ({ columns: ['Item', 'Quantity', 'Amount'], rows: Array.from({ length: 5 }, () => ['', '', '']) });
async function request<T>(method = 'GET', body?: unknown, query = ''): Promise<T> {
  const response = await fetch('/api/records' + query, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Unable to save your note. Please try again.');
  return result;
}

export default function NotesPage({ canWrite, search, notify }: { canWrite: boolean; search: string; notify: (message: string) => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState<'text' | 'table'>('text');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [chooser, setChooser] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const load = useCallback(async () => {
    setLoadError(''); setLoading(true);
    try {
      const result: Note[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page: { records: Note[]; nextOffset: number | null } = await request('GET', undefined, `?module=notes&limit=500&offset=${offset}`);
        result.push(...page.records); offset = page.nextOffset;
      }
      setNotes(result.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'Unable to load notes.'); }
    finally { setLoading(false); }
  }, []);
  // Fetch the saved notes on mount; updates after loading reflect external data.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    // Capture portal navigation before this editor unmounts.
    const guard = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.sidebar nav button, .notification-button, .account button') && !window.confirm('Discard your unsaved note changes?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    document.addEventListener('click', guard, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true); };
  }, [dirty]);
  function create(noteType: 'text' | 'table') {
    setDraft({ title: '', noteType, content: '', table: blankTable() }); setDirty(false); setChooser(false); setError('');
  }
  function open(note: Note) {
    try {
      setDraft({ id: note.id, title: note.title, noteType: note.data.noteType === 'table' ? 'table' : 'text', content: note.data.content || '', table: note.data.noteType === 'table' ? parseNoteTable(note.data.table) : blankTable() });
      setDirty(false); setError('');
    } catch { notify('This table could not be opened. Its saved data has been preserved.'); }
  }
  function change(patch: Partial<Draft>) { setDraft(current => current ? { ...current, ...patch } : current); setDirty(true); }
  function close() { if (!busy && (!dirty || window.confirm('Discard your unsaved note changes?'))) { setDraft(null); setDirty(false); setError(''); } }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const data = sanitizeNoteData({ noteType: draft.noteType, content: draft.content, table: JSON.stringify(draft.table) });
      if (!draft.title.trim()) throw new Error('Give your note a title.');
      await request(draft.id ? 'PATCH' : 'POST', { id: draft.id, module: 'notes', title: draft.title.trim(), data });
      setTab(draft.noteType); setDraft(null); setDirty(false); notify('Note saved.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save note. Your changes are still here.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function remove(note: Note) {
    if (pending.current || !window.confirm(`Delete “${note.title}”? This removes the note from your notes list.`)) return;
    pending.current = true; setBusy(true);
    try { await request('DELETE', { id: note.id }); setNotes(current => current.filter(item => item.id !== note.id)); notify('Note deleted.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Unable to delete note.'); }
    finally { pending.current = false; setBusy(false); }
  }
  const visible = notes.filter(note => note.data.noteType === tab && `${note.title} ${note.data.content || ''} ${note.data.table || ''}`.toLowerCase().includes(search.toLowerCase()));

  if (draft) return <section className="notes-workspace">
    <div className="page-heading"><div><span className="section-kicker">Notes / {draft.noteType === 'table' ? 'Table note' : 'Text note'}</span><h1>{canWrite ? draft.id ? 'Edit note' : 'Create note' : 'View note'}</h1><p>{draft.noteType === 'table' ? 'Keep numbers organized in rows and columns.' : 'Keep important farm information in one place.'}</p></div><button className="button" disabled={busy} onClick={close}><ArrowLeft size={16}/> Back to notes</button></div>
    <form className="panel note-editor" onSubmit={save}>
      <fieldset disabled={busy}>
        <label>Note title<input autoFocus required maxLength={150} readOnly={!canWrite} value={draft.title} onChange={e => change({ title: e.target.value })} placeholder="Give this note a name"/></label>
        <div className="note-editor-status"><span>{draft.noteType === 'table' ? 'Table note' : 'Text note'}</span><span>{dirty ? 'Unsaved changes' : draft.id ? 'Saved note' : 'New note'}</span></div>
        {draft.noteType === 'text' ? <><label className="note-content-label">Note content<textarea className="note-paper" dir="auto" readOnly={!canWrite} value={draft.content} maxLength={NOTE_LIMITS.text} onChange={e => change({ content: e.target.value })} placeholder="Write your farm notes here…"/></label><p className="note-hint">{draft.content.length.toLocaleString()} / 50,000 characters</p></> : <>
          {canWrite && <div className="button-row note-table-tools"><button type="button" className="button" disabled={draft.table.rows.length >= NOTE_LIMITS.rows} onClick={() => change({ table: { ...draft.table, rows: [...draft.table.rows, draft.table.columns.map(() => '')] } })}><Plus size={15}/> Add row</button><button type="button" className="button" disabled={draft.table.columns.length >= NOTE_LIMITS.columns} onClick={() => change({ table: { columns: [...draft.table.columns, `Column ${draft.table.columns.length + 1}`], rows: draft.table.rows.map(row => [...row, '']) } })}><Plus size={15}/> Add column</button><span className="note-hint">{draft.table.rows.length} rows × {draft.table.columns.length} columns</span></div>}
          <div className="table-wrap note-sheet"><table><thead><tr><th scope="col">#</th>{draft.table.columns.map((column, c) => <th key={c} scope="col"><div className="note-column"><input aria-label={`Column ${c + 1} heading`} readOnly={!canWrite} maxLength={NOTE_LIMITS.heading} value={column} onChange={e => change({ table: { ...draft.table, columns: draft.table.columns.map((value, i) => i === c ? e.target.value : value) } })}/>{canWrite && <button type="button" aria-label={`Remove column ${c + 1}`} title="Remove column" disabled={draft.table.columns.length <= 1} onClick={() => { if (window.confirm(`Remove column “${column}” and its contents?`)) change({ table: { columns: draft.table.columns.filter((_, i) => i !== c), rows: draft.table.rows.map(row => row.filter((_, i) => i !== c)) } }); }}><X size={14}/></button>}</div></th>)}{canWrite && <th scope="col">Remove</th>}</tr></thead><tbody>{draft.table.rows.map((row, r) => <tr key={r}><th scope="row">{r + 1}</th>{row.map((cell, c) => <td key={c}><input aria-label={`Row ${r + 1}, column ${c + 1}`} dir="auto" readOnly={!canWrite} maxLength={NOTE_LIMITS.cell} value={cell} onChange={e => change({ table: { ...draft.table, rows: draft.table.rows.map((item, ri) => ri === r ? item.map((value, ci) => ci === c ? e.target.value : value) : item) } })}/></td>)}{canWrite && <td><button type="button" className="row-action danger" aria-label={`Remove row ${r + 1}`} disabled={draft.table.rows.length <= 1} onClick={() => { if (!row.some(Boolean) || window.confirm(`Remove row ${r + 1} and its contents?`)) change({ table: { ...draft.table, rows: draft.table.rows.filter((_, i) => i !== r) } }); }}><X size={14}/></button></td>}</tr>)}</tbody></table></div>
          <p className="note-hint">Up to 200 rows and 20 columns. Enter numbers or text in any cell.</p>
        </>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="note-editor-footer"><button type="button" className="button" disabled={busy} onClick={close}>{canWrite ? 'Cancel' : 'Back'}</button>{canWrite && <button className="button primary" disabled={busy}><Save size={16}/>{busy ? 'Saving…' : 'Save note'}</button>}</footer>
    </form>
  </section>;

  return <section className="notes-workspace">
    <div className="page-heading"><div><span className="section-kicker">Farm notebook</span><h1>Notes</h1><p>Important information, organized your way.</p></div>{canWrite && <button className="button primary" onClick={() => setChooser(true)}><Plus size={17}/> Create new note</button>}</div>
    <div className="finance-subtabs" role="tablist" aria-label="Note types">{(['text', 'table'] as const).map(type => <button key={type} role="tab" aria-selected={tab === type} className={tab === type ? 'active' : ''} onClick={() => setTab(type)}><span>{type === 'text' ? <FileText size={21}/> : <Table2 size={21}/>}</span><div><strong>{type === 'text' ? 'Text notes' : 'Table notes'}</strong><small>{type === 'text' ? 'Plain writing, like a Word document' : 'Rows and columns, like an Excel sheet'}</small></div><b>{notes.filter(note => note.data.noteType === type).length}</b></button>)}</div>
    {loading ? <div className="panel notes-empty" role="status">Loading your notes…</div> : loadError ? <div className="panel notes-empty" role="alert"><p>{loadError}</p><button className="button" onClick={() => void load()}>Try again</button></div> : visible.length ? <div className="notes-grid">{visible.map(note => <article className="panel note-card" key={note.id}><span className="note-card-icon">{tab === 'text' ? <FileText size={22}/> : <Table2 size={22}/>}</span><h2>{note.title}</h2><p className="note-preview" dir="auto">{tab === 'text' ? note.data.content || 'Empty text note' : tablePreview(note.data.table)}</p><small>Updated {new Date(note.updated_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' })}</small><div className="note-card-actions"><button className="button" onClick={() => open(note)}>{canWrite ? 'Edit note' : 'View note'}</button>{canWrite && <button className="row-action danger" disabled={busy} onClick={() => void remove(note)}>Delete</button>}</div></article>)}</div> : <div className="panel notes-empty">{tab === 'text' ? <FileText size={36}/> : <Table2 size={36}/>}<h2>{search ? 'No matching notes' : `No ${tab} notes yet`}</h2><p>{search ? 'Try a different search.' : tab === 'text' ? 'Save contacts, instructions and important farm information.' : 'Keep quantities, figures and lists in separate table notes.'}</p>{canWrite && !search && <button className="button primary" onClick={() => setChooser(true)}><Plus size={16}/> Create new note</button>}</div>}
    {chooser && <NoteTypeChooser onClose={() => setChooser(false)} onChoose={create}/>}
  </section>;
}

function tablePreview(value: string) {
  try { const table = parseNoteTable(value); return `${table.rows.length} rows · ${table.columns.length} columns\n${table.columns.join(' · ')}`; }
  catch { return 'Saved table'; }
}

function NoteTypeChooser({ onClose, onChoose }: { onClose: () => void; onChoose: (type: 'text' | 'table') => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="note-type-dialog" onCancel={onClose} onClose={onClose} aria-labelledby="note-type-title"><header><div><span className="section-kicker">New note</span><h2 id="note-type-title">Choose your note type</h2></div><button type="button" className="button" aria-label="Close note type chooser" onClick={onClose}><X size={18}/></button></header><div className="note-type-options"><button onClick={() => onChoose('text')}><FileText size={30}/><strong>Text note</strong><span>Word-style plain writing for contacts, instructions and important information.</span></button><button onClick={() => onChoose('table')}><Table2 size={30}/><strong>Table note</strong><span>Excel-style rows and columns for numbers, quantities and organized lists.</span></button></div></dialog>;
}
