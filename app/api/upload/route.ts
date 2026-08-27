import { env } from 'cloudflare:workers';
import { AuthError, requireUser } from '@/lib/farm-auth';
import { audit, db, ensureDatabase, errorResponse, jsonResponse, nowIso, validateOrigin } from '@/lib/farm-db';

const allowedTypes = new Set(['image/jpeg','image/png','image/webp','application/pdf']);

export async function POST(request: Request) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request);
    const form = await request.formData();
    const file = form.get('file');
    const recordId = String(form.get('recordId') || '').slice(0, 80) || null;
    if (!(file instanceof File)) return errorResponse('Choose a photo, bill, receipt or PDF.');
    if (!allowedTypes.has(file.type)) return errorResponse('Only JPG, PNG, WebP and PDF files are accepted.');
    if (file.size > 8 * 1024 * 1024) return errorResponse('The file must be smaller than 8 MB.');
    if (!env.FILES) return errorResponse('File storage is unavailable.', 503);
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const key = `uploads/${new Date().toISOString().slice(0, 10)}/${id}-${safeName}`;
    await env.FILES.put(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
    await db().prepare('INSERT INTO files (id, record_id, object_key, filename, content_type, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, recordId, key, safeName, file.type, file.size, user.id, nowIso()).run();
    await audit(user.id, 'upload', 'files', id, `Uploaded ${safeName}`);
    return jsonResponse({ id, filename: safeName }, 201);
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('The file could not be uploaded.', 500);
  }
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requireUser(request);
    const id = new URL(request.url).searchParams.get('id')?.slice(0, 80);
    if (!id) return errorResponse('Choose an attachment.');
    const row = await db().prepare('SELECT object_key, filename, content_type FROM files WHERE id = ?').bind(id)
      .first<{ object_key: string; filename: string; content_type: string }>();
    if (!row) return errorResponse('Attachment not found.', 404);
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
