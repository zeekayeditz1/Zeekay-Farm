import { env } from 'cloudflare:workers';
import { AuthError, canAccess, requireUser } from '@/lib/farm-auth';
import { db, ensureDatabase, errorResponse, jsonResponse, nowIso, validateOrigin } from '@/lib/farm-db';

const allowedTypes = new Set(['image/jpeg','image/png','image/webp','application/pdf']);

async function hasValidSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') return bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value,index)=>bytes[index]===value);
  if (file.type === 'image/webp') return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (file.type === 'application/pdf') return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0,5)) === '%PDF-';
  return false;
}

export async function POST(request: Request) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request);
    const form = await request.formData();
    const file = form.get('file');
    const recordId = String(form.get('recordId') || '').slice(0, 80) || null;
    await requireRecordAccess(request, recordId, true);
    if (!(file instanceof File)) return errorResponse('Choose a photo, bill, receipt or PDF.');
    if (!allowedTypes.has(file.type)) return errorResponse('Only JPG, PNG, WebP and PDF files are accepted.');
    if (file.size <= 0) return errorResponse('The attachment is empty.');
    if (file.size > 8 * 1024 * 1024) return errorResponse('The file must be smaller than 8 MB.');
    if (!await hasValidSignature(file)) return errorResponse('The file content does not match its JPG, PNG, WebP or PDF type.');
    if (!env.FILES) return errorResponse('File storage is unavailable.', 503);
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'attachment';
    const key = `uploads/${new Date().toISOString().slice(0, 10)}/${id}-${safeName}`;
    const now = nowIso();
    await env.FILES.put(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
    try {
      await db().batch([
        db().prepare('INSERT INTO files (id, record_id, object_key, filename, content_type, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, recordId, key, safeName, file.type, file.size, user.id, now),
        db().prepare('INSERT INTO audit_log (id, user_id, action, module, record_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), user.id, 'upload', 'files', id, `Uploaded ${safeName}`, now),
      ]);
    } catch (error) {
      await Promise.allSettled([env.FILES.delete(key)]);
      throw error;
    }
    return jsonResponse({ id, filename: safeName }, 201);
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('The file could not be uploaded.', 500);
  }
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const recordId = url.searchParams.get('recordId');
    if (recordId) {
      await requireRecordAccess(request, recordId, false);
      const files = await db().prepare('SELECT id, filename, content_type, size FROM files WHERE record_id = ? ORDER BY created_at').bind(recordId).all();
      return jsonResponse({files:files.results});
    }
    const id = url.searchParams.get('id')?.slice(0, 80);
    if (!id) return errorResponse('Choose an attachment.');
    const row = await db().prepare('SELECT object_key, filename, content_type, record_id FROM files WHERE id = ?').bind(id)
      .first<{ object_key: string; filename: string; content_type: string; record_id: string }>();
    if (!row) return errorResponse('Attachment not found.', 404);
    await requireRecordAccess(request, row.record_id, false);
    if (!env.FILES) return errorResponse('File storage is unavailable.', 503);
    const value = await env.FILES.get(row.object_key, 'arrayBuffer');
    if (!value) return errorResponse('Attachment data is unavailable.', 404);
    return new Response(value, {
      headers: {
        'Content-Type': row.content_type,
        'Content-Disposition': `inline; filename="${row.filename.replace(/["\\]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('The attachment could not be opened.', 500);
  }
}

async function requireRecordAccess(request: Request, id: string | null, write: boolean) {
  const user = await requireUser(request);
  const record = id ? await db().prepare('SELECT module FROM records WHERE id = ? AND archived = 0').bind(id).first<{module:string}>() : null;
  if (!record) throw new AuthError('Record not found.',404);
  if (!canAccess(user,record.module === 'dailyexpenses' ? 'finance' : record.module,write)) throw new AuthError('You cannot access this attachment.',403);
  return user;
}

export async function DELETE(request: Request) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const body = await request.json() as {id?:string};
    const file = await db().prepare('SELECT record_id, object_key, filename FROM files WHERE id = ?').bind(String(body.id||'').slice(0,80)).first<{record_id:string;object_key:string;filename:string}>();
    if (!file) return errorResponse('Attachment not found.',404);
    const user = await requireRecordAccess(request,file.record_id,true);
    const now = nowIso();
    await db().batch([
      db().prepare('DELETE FROM files WHERE id = ?').bind(body.id),
      db().prepare('INSERT INTO audit_log (id,user_id,action,module,record_id,summary,created_at) VALUES (?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(),user.id,'delete','files',body.id||null,`Deleted attachment ${file.filename}`,now),
    ]);
    if (env.FILES) await Promise.allSettled([env.FILES.delete(file.object_key)]);
    return jsonResponse({ok:true});
  } catch(error) {
    if (error instanceof AuthError) return errorResponse(error.message,error.status);
    return errorResponse('The attachment could not be deleted.',500);
  }
}
