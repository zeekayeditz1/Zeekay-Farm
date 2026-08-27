import { AuthError, hashPassword, normalizePhone, requireUser } from '@/lib/farm-auth';
import { audit, cleanText, db, ensureDatabase, errorResponse, jsonResponse, nowIso, validateOrigin } from '@/lib/farm-db';

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    if (user.role !== 'owner') return errorResponse('Only owners can manage portal users.', 403);
    const result = await db().prepare('SELECT id, name, phone, role, permissions, active, created_at, last_login_at FROM users ORDER BY created_at').all();
    return jsonResponse({ users: result.results.map((row) => ({ ...row, permissions: JSON.parse(String(row.permissions || '[]')) })) });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('Users could not be loaded.', 500);
  }
}

export async function POST(request: Request) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const owner = await requireUser(request);
    if (owner.role !== 'owner') return errorResponse('Only owners can add portal users.', 403);
    const body = await request.json() as Record<string, unknown>;
    const name = cleanText(body.name, 100);
    const phone = normalizePhone(cleanText(body.phone, 30));
    const password = cleanText(body.password, 200);
    const role = cleanText(body.role, 30) || 'worker';
    const permissions = Array.isArray(body.permissions) ? body.permissions.filter((item): item is string => typeof item === 'string').slice(0, 50) : [];
    if (!name || !phone || password.length < 10) return errorResponse('Name, phone and a password of at least 10 characters are required.');
    const id = crypto.randomUUID();
    const secured = await hashPassword(password);
    await db().prepare('INSERT INTO users (id, name, phone, password_hash, salt, role, permissions, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
      .bind(id, name, phone, secured.hash, secured.salt, role, JSON.stringify(permissions), nowIso()).run();
    await audit(owner.id, 'create', 'users', id, `Added portal user ${name}`);
    return jsonResponse({ id }, 201);
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('The user could not be added. The phone number may already exist.', 500);
  }
}
