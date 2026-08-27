import { env } from 'cloudflare:workers';
import { db, ensureDatabase, FarmUser, nowIso } from './farm-db';

const COOKIE = 'ali_farm_session';
const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  const result = new Uint8Array(value.length / 2);
  for (let index = 0; index < result.length; index += 1) result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return result;
}

async function hashToken(token: string) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

const FIRST_OWNER_PHONE_HASHES = new Set([
  'c5d6612999d0b2e9d889e3cc9f19ad3664d216211db3e35e74d4bd948e1cc19a',
  'bf841f39ab84d73e68985bec97070d921e9eb2f97e660939bff15701c6e7e27a',
]);

export function normalizePhone(value: unknown) {
  let phone = String(value || '').replace(/[^0-9+]/g, '');
  if (phone.startsWith('+92')) phone = `0${phone.slice(3)}`;
  if (phone.startsWith('92') && phone.length === 12) phone = `0${phone.slice(2)}`;
  return phone;
}

export async function canCreateFirstOwner(phone: string) {
  return FIRST_OWNER_PHONE_HASHES.has(await hashToken(normalizePhone(phone)));
}

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  if (!env.AUTH_PEPPER) throw new Error('Authentication secret is unavailable.');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.AUTH_PEPPER),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const passwordBytes = encoder.encode(`${toHex(salt)}:${password}`);
  const signature = await crypto.subtle.sign('HMAC', key, passwordBytes);
  return { hash: toHex(signature), salt: toHex(salt) };
}

export async function verifyPassword(password: string, expectedHash: string, salt: string) {
  const result = await hashPassword(password, salt);
  const provided = fromHex(result.hash);
  const expected = fromHex(expectedHash);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean };
  return provided.byteLength === expected.byteLength
    ? subtle.timingSafeEqual(provided, expected)
    : !subtle.timingSafeEqual(provided, provided);
}

function cookieValue(request: Request) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}

export async function currentUser(request: Request): Promise<FarmUser | null> {
  await ensureDatabase();
  const token = cookieValue(request);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await db().prepare(
    `SELECT u.id, u.name, u.phone, u.role, u.permissions
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
  ).bind(tokenHash, nowIso()).first<{ id: string; name: string; phone: string; role: FarmUser['role']; permissions: string }>();
  if (!row) return null;
  return { ...row, permissions: JSON.parse(row.permissions || '[]') };
}

export async function requireUser(request: Request) {
  const user = await currentUser(request);
  if (!user) throw new AuthError('Please sign in to continue.', 401);
  return user;
}

export function canAccess(user: FarmUser, module: string, write = false) {
  if (user.role === 'owner') return true;
  const permission = write ? `${module}:write` : `${module}:read`;
  return user.permissions.includes('*') || user.permissions.includes(permission) || (!write && user.permissions.includes(`${module}:write`));
}

export async function prepareSession(userId: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toHex(bytes);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const createdAt = nowIso();
  return {
    id: crypto.randomUUID(),
    userId,
    tokenHash: await hashToken(token),
    expiresAt: expires.toISOString(),
    createdAt,
    cookie: `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
  };
}

export async function createSession(userId: string) {
  const session = await prepareSession(userId);
  await db().batch([
    db().prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt),
    db().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(session.createdAt, userId),
  ]);
  return session.cookie;
}

export async function destroySession(request: Request) {
  const token = cookieValue(request);
  if (token) await db().prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export class AuthError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}
