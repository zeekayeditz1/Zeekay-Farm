import { audit, cleanText, db, ensureDatabase, errorResponse, jsonResponse, nowIso, validateOrigin } from '@/lib/farm-db';
import { canCreateFirstOwner, createSession, currentUser, destroySession, hashPassword, normalizePhone, prepareSession, verifyPassword } from '@/lib/farm-auth';

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const count = await db().prepare('SELECT COUNT(*) AS count FROM users WHERE active = 1').first<{ count: number }>();
    const user = await currentUser(request);
    return jsonResponse({ setupRequired: Number(count?.count || 0) === 0, user });
  } catch {
    return errorResponse('Unable to open the farm database.', 500);
  }
}

export async function POST(request: Request) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 30);

    if (action === 'logout') {
      return jsonResponse({ ok: true }, 200, { 'Set-Cookie': await destroySession(request) });
    }

    const phone = normalizePhone(cleanText(body.phone, 30));
    const password = cleanText(body.password, 200);
    if (!phone || password.length < 10) return errorResponse('Enter a valid phone number and a password of at least 10 characters.');

    if (action === 'setup') {
      const count = await db().prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
      if (Number(count?.count || 0) !== 0) return errorResponse('Farm setup is already complete.', 409);
      if (!await canCreateFirstOwner(phone)) return errorResponse('Use one of the registered Ali Livestock owner phone numbers for first-time setup.', 403);
      const name = cleanText(body.name, 100);
      if (!name) return errorResponse('Owner name is required.');
      const id = crypto.randomUUID();
      const passwordData = await hashPassword(password);
      const session = await prepareSession(id);
      const now = nowIso();
      await db().batch([
        db().prepare('INSERT INTO users (id, name, phone, password_hash, salt, role, permissions, active, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
          .bind(id, name, phone, passwordData.hash, passwordData.salt, 'owner', '["*"]', now, now),
        db().prepare('INSERT INTO audit_log (id, user_id, action, module, record_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), id, 'setup', 'users', id, 'Created the first farm owner account', now),
        db().prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt),
      ]);
      return jsonResponse({ ok: true }, 201, { 'Set-Cookie': session.cookie });
    }

    if (action === 'login') {
      const user = await db().prepare(
        'SELECT id, password_hash, salt FROM users WHERE phone = ? AND active = 1',
      ).bind(phone).first<{ id: string; password_hash: string; salt: string }>();
      const dummy = await hashPassword(password, '00112233445566778899aabbccddeeff');
      const valid = user
        ? await verifyPassword(password, user.password_hash, user.salt)
        : await verifyPassword(password, dummy.hash, '00112233445566778899aabbccddeeff').then(() => false);
      if (!user || !valid) return errorResponse('Phone number or password is incorrect.', 401);
      await audit(user.id, 'login', 'users', user.id, 'Signed in');
      return jsonResponse({ ok: true }, 200, { 'Set-Cookie': await createSession(user.id) });
    }

    return errorResponse('Unknown authentication action.');
  } catch (error) {
    if (error instanceof Error && error.message === 'Cross-site request rejected.') {
      return errorResponse('Refresh the secure HTTPS page, then try again.', 403);
    }
    console.error('Ali Livestock authentication error', error instanceof Error ? error.message : 'Unknown error');
    return errorResponse('Authentication could not be completed.', 500);
  }
}
