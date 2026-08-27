import { AuthError, requireUser } from '@/lib/farm-auth';
import { db, ensureDatabase, errorResponse, nowIso } from '@/lib/farm-db';

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    if (user.role !== 'owner') return errorResponse('Only owners can download a complete backup.', 403);
    const [records, users, files, audit] = await Promise.all([
      db().prepare('SELECT * FROM records ORDER BY created_at').all(),
      db().prepare('SELECT id, name, phone, role, permissions, active, created_at, last_login_at FROM users ORDER BY created_at').all(),
      db().prepare('SELECT * FROM files ORDER BY created_at').all(),
      db().prepare('SELECT * FROM audit_log ORDER BY created_at').all(),
    ]);
    return new Response(JSON.stringify({ exportedAt: nowIso(), farm: 'Ali Dairies', records: records.results, users: users.results, files: files.results, audit: audit.results }, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="ali-dairies-backup-${nowIso().slice(0,10)}.json"`, 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('Backup could not be created.', 500);
  }
}
