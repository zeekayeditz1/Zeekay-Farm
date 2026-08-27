import { env } from 'cloudflare:workers';

export type FarmUser = {
  id: string;
  name: string;
  phone: string;
  role: 'owner' | 'manager' | 'accountant' | 'vet' | 'worker' | 'viewer';
  permissions: string[];
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'worker',
    permissions TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    record_key TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    event_date TEXT NOT NULL,
    linked_id TEXT,
    data TEXT NOT NULL DEFAULT '{}',
    archived INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    record_id TEXT,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    record_id TEXT,
    object_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_records_module_date ON records(module, event_date)`,
  `CREATE INDEX IF NOT EXISTS idx_records_linked_id ON records(linked_id)`,
  `CREATE INDEX IF NOT EXISTS idx_records_active ON records(module, archived, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_records_module_key ON records(module, record_key) WHERE record_key IS NOT NULL AND archived = 0`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)`,
];

let schemaReady: Promise<void> | null = null;

export function db(): D1Database {
  if (!env.DB) throw new Error('Farm database binding is unavailable.');
  return env.DB;
}

export async function ensureDatabase() {
  schemaReady ??= (async () => {
    await db().batch(schemaStatements.map((sql) => db().prepare(sql)));
    await db().prepare('PRAGMA optimize').run();
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

export const nowIso = () => new Date().toISOString();

export async function audit(userId: string, action: string, module: string, recordId: string | null, summary: string) {
  await db().prepare(
    'INSERT INTO audit_log (id, user_id, action, module, record_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), userId, action, module, recordId, summary.slice(0, 300), nowIso()).run();
}

export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function validateOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new Error('Cross-site request rejected.');
  }
}

export function cleanText(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
