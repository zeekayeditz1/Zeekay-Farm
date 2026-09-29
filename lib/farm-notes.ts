export type NoteTable = { columns: string[]; rows: string[][] };
export const NOTE_LIMITS = { text: 50_000, table: 100_000, rows: 200, columns: 20, cell: 500, heading: 80 };

export class NoteValidationError extends Error {}

export function parseNoteTable(value: unknown): NoteTable {
  if (typeof value !== 'string' || value.length > NOTE_LIMITS.table) throw new NoteValidationError('The table is too large. Keep it below 100,000 characters.');
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new NoteValidationError('Invalid note table.'); }
  if (!parsed || !Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)
    || parsed.columns.length < 1 || parsed.columns.length > NOTE_LIMITS.columns
    || parsed.rows.length < 1 || parsed.rows.length > NOTE_LIMITS.rows
    || !parsed.columns.every((cell: unknown) => typeof cell === 'string' && cell.length <= NOTE_LIMITS.heading)
    || !parsed.rows.every((row: unknown) => Array.isArray(row) && row.length === parsed.columns.length
      && row.every((cell: unknown) => typeof cell === 'string' && cell.length <= NOTE_LIMITS.cell))) {
    throw new NoteValidationError('Use 1–20 columns and 1–200 rows, with headings up to 80 and cells up to 500 characters.');
  }
  return { columns: parsed.columns, rows: parsed.rows };
}

// Validate without truncation: long notes and serialized tables must survive a round trip exactly.
export function sanitizeNoteData(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NoteValidationError('Choose a note type.');
  const data = value as Record<string, unknown>;
  if (data.noteType === 'text') {
    if (typeof data.content !== 'string' || data.content.length > NOTE_LIMITS.text) throw new NoteValidationError('Text notes can contain up to 50,000 characters.');
    return { noteType: 'text', content: data.content, reminderEnabled: 'no' };
  }
  if (data.noteType === 'table') return { noteType: 'table', table: JSON.stringify(parseNoteTable(data.table)), reminderEnabled: 'no' };
  throw new NoteValidationError('Choose Text note or Table note.');
}
