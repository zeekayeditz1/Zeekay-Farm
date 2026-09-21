import { AuthError, hashPassword, normalizePhone, requireUser } from '@/lib/farm-auth';
import { audit, cleanText, db, ensureDatabase, errorResponse, jsonResponse, nowIso, validateOrigin } from '@/lib/farm-db';

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    if (user.role !== 'owner') return errorResponse('Only owners can manage portal users.', 403);
    const result = await db().prepare('SELECT id, name, phone, role, permissions, active, created_at, last_login_at FROM users WHERE active <> 2 ORDER BY created_at').all();
    return jsonResponse({ users: result.results.map((row) => ({ ...row, permissions: JSON.parse(String(row.permissions || '[]')) })) });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('Users could not be loaded.', 500);
  }
}

export async function PATCH(request: Request) {
  return changeUser(request, false);
}

export async function DELETE(request: Request) {
  return changeUser(request, true);
}

async function changeUser(request: Request, removing: boolean) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const owner = await requireUser(request);
    if (owner.role !== 'owner') return errorResponse('Only owners can manage portal users.', 403);
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    const existing = await db().prepare('SELECT id, name, role, permissions FROM users WHERE id = ? AND active <> 2').bind(id).first<{id:string;name:string;role:string;permissions:string}>();
    if (!existing) return errorResponse('User not found.', 404);
    const role = cleanText(body.role,30) || existing.role;
    if (id === owner.id && (removing || role !== 'owner')) return errorResponse('You cannot delete your own account or remove your own owner access.');
    const now = nowIso();
    const statements: D1PreparedStatement[] = [];
    if (removing) {
      statements.push(db().prepare('UPDATE users SET active = 2 WHERE id = ?').bind(id));
    } else {
      const name = cleanText(body.name,100);
      const phone = normalizePhone(cleanText(body.phone,30));
      const password = cleanText(body.password,200);
      if (!name || !phone) return errorResponse('Name and phone are required.');
      if (!['owner','manager','accountant','vet','worker','viewer'].includes(role)) return errorResponse('Choose a valid role.');
      if (password && password.length < 10) return errorResponse('Use at least 10 characters for a new password.');
      const permissions = role === existing.role ? existing.permissions : JSON.stringify(role === 'owner' ? ['*'] : Array.isArray(body.permissions) ? body.permissions.filter(p=>typeof p==='string').slice(0,50) : []);
      statements.push(db().prepare('UPDATE users SET name = ?, phone = ?, role = ?, permissions = ? WHERE id = ?').bind(name,phone,role,permissions,id));
      if (password) {
        const secured = await hashPassword(password);
        statements.push(db().prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(secured.hash,secured.salt,id));
      }
      if (password || role !== existing.role) statements.push(db().prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
    }
    if (removing) statements.push(db().prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
    statements.push(db().prepare('INSERT INTO audit_log (id,user_id,action,module,record_id,summary,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),owner.id,removing?'delete':'update','users',id,`${removing?'Deleted':'Updated'} portal user ${existing.name}`,now));
    await db().batch(statements);
    return jsonResponse({ok:true});
  } catch(error) {
    if (error instanceof AuthError) return errorResponse(error.message,error.status);
    if (error instanceof Error && /UNIQUE/i.test(error.message)) return errorResponse('That phone number is already in use.',409);
    return errorResponse('The user could not be changed.',500);
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
