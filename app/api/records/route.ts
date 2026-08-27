import { AuthError, canAccess, requireUser } from '@/lib/farm-auth';
import { audit, cleanText, db, ensureDatabase, errorResponse, jsonResponse, nowIso, validateOrigin } from '@/lib/farm-db';

type RecordRow = {
  id: string; module: string; record_key: string | null; title: string; status: string;
  event_date: string; linked_id: string | null; data: string; archived: number;
  created_at: string; updated_at: string; created_by_name?: string;
};

const allowedModules = new Set(['animals','sales','weights','health','breeding','milk','fields','gur','labour','equipment','maintenance','finance','dailyexpenses','reminders']);

function permissionModule(module: string) {
  return module === 'dailyexpenses' ? 'finance' : module;
}

function serialize(row: RecordRow) {
  return { ...row, archived: Boolean(row.archived), data: JSON.parse(row.data || '{}') };
}

function addInterval(date: string, amount: number, unit: string) {
  const result = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(result.getTime())) return '';
  if (unit === 'days') result.setUTCDate(result.getUTCDate() + amount);
  else if (unit === 'weeks') result.setUTCDate(result.getUTCDate() + amount * 7);
  else {
    const day = result.getUTCDate();
    const monthIndex = result.getUTCFullYear() * 12 + result.getUTCMonth() + (unit === 'years' ? amount * 12 : amount);
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    result.setUTCFullYear(year, month, Math.min(day, lastDay));
  }
  return result.toISOString().slice(0, 10);
}

function defaultReminderTitle(sourceModule: string, title: string, data: Record<string, unknown>) {
  if (sourceModule === 'health') return `${cleanText(data.medicine, 80) || 'Vaccination / medicine'} — ${title}`;
  if (sourceModule === 'breeding') return `Gestation / breeding check — ${title}`;
  if (sourceModule === 'maintenance') return `${cleanText(data.jobType, 60) || 'Maintenance'} — ${cleanText(data.assetName, 80) || title}`;
  if (sourceModule === 'equipment') return `Equipment service — ${title}`;
  return `${title} — follow-up`;
}

async function addAutomaticReminder(userId: string, sourceId: string, sourceModule: string, title: string, eventDate: string, data: Record<string, unknown>) {
  const intervalValue = Number(data.reminderIntervalValue || 0);
  const intervalUnit = cleanText(data.reminderIntervalUnit, 10) || 'months';
  const explicitDate = cleanText(data.reminderDate || data.nextDate || data.nextCheckDate || data.nextMaintenanceDate || data.expectedCalvingDate, 20);
  const nextDate = explicitDate || (data.reminderEnabled === 'yes' ? addInterval(eventDate, intervalValue, intervalUnit) : '');
  if (!nextDate) return;
  const id = crypto.randomUUID();
  const now = nowIso();
  const linkedReference = cleanText(data.animalTag || data.tag || data.assetName || data.equipmentName || data.fieldNumber || data.workerName || data.linkedReference, 100);
  const reminderTitle = cleanText(data.reminderTitle, 150) || defaultReminderTitle(sourceModule, title, data);
  await db().prepare(
    'INSERT INTO records (id, module, title, status, event_date, linked_id, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, 'reminders', reminderTitle, 'upcoming', nextDate, sourceId, JSON.stringify({
    sourceModule,
    sourceId,
    linkedReference,
    intervalValue: intervalValue > 0 ? intervalValue : '',
    intervalUnit,
    recurrenceEnabled: intervalValue > 0 ? 'yes' : 'no',
    originalEventDate: eventDate,
  }), userId, now, now).run();
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    const url = new URL(request.url);
    const module = cleanText(url.searchParams.get('module'), 30);
    const search = cleanText(url.searchParams.get('search'), 80);
    if (module && !allowedModules.has(module)) return errorResponse('Unknown farm section.');
    if (module && !canAccess(user, permissionModule(module))) return errorResponse('You do not have access to this section.', 403);
    const clauses = ['r.archived = 0'];
    const bindings: unknown[] = [];
    if (module) { clauses.push('r.module = ?'); bindings.push(module); }
    if (search) { clauses.push('(r.title LIKE ? OR r.record_key LIKE ? OR r.data LIKE ?)'); const term = `%${search}%`; bindings.push(term, term, term); }
    const result = await db().prepare(
      `SELECT r.*, u.name AS created_by_name FROM records r LEFT JOIN users u ON u.id = r.created_by
       WHERE ${clauses.join(' AND ')} ORDER BY r.event_date DESC, r.created_at DESC LIMIT 500`,
    ).bind(...bindings).all<RecordRow>();
    const visible = user.role === 'owner' ? result.results : result.results.filter((row) => canAccess(user, permissionModule(row.module)));
    return jsonResponse({ records: visible.map(serialize) });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('Farm records could not be loaded.', 500);
  }
}

export async function POST(request: Request) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const module = cleanText(body.module, 30);
    if (!allowedModules.has(module)) return errorResponse('Unknown farm section.');
    if (!canAccess(user, permissionModule(module), true)) return errorResponse('You cannot add records in this section.', 403);
    const title = cleanText(body.title, 150);
    const recordKey = cleanText(body.recordKey, 80) || null;
    const status = cleanText(body.status, 30) || 'active';
    const eventDate = cleanText(body.eventDate, 20) || nowIso().slice(0, 10);
    const linkedId = cleanText(body.linkedId, 80) || null;
    const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
    if (!title) return errorResponse('A record name or title is required.');
    const id = crypto.randomUUID();
    const now = nowIso();
    await db().prepare(
      `INSERT INTO records (id, module, record_key, title, status, event_date, linked_id, data, archived, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(id, module, recordKey, title, status, eventDate, linkedId, JSON.stringify(data), user.id, now, now).run();
    await audit(user.id, 'create', module, id, `Added ${title}`);
    if (module === 'sales' && recordKey) {
      await db().prepare("UPDATE records SET status = ?, updated_at = ? WHERE module = 'animals' AND record_key = ? AND archived = 0")
        .bind(status, now, recordKey).run();
      await audit(user.id, 'status', 'animals', null, `Marked animal ${recordKey} as ${status}`);
    }
    if (module !== 'reminders') await addAutomaticReminder(user.id, id, module, title, eventDate, data);
    return jsonResponse({ id }, 201);
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    const message = error instanceof Error && /UNIQUE/i.test(error.message) ? 'That tag or record number is already in use.' : 'The record could not be saved.';
    return errorResponse(message, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    const existing = await db().prepare('SELECT id, module, title, event_date, linked_id, data FROM records WHERE id = ?').bind(id).first<{ id: string; module: string; title: string; event_date: string; linked_id: string | null; data: string }>();
    if (!existing) return errorResponse('Record not found.', 404);
    if (!canAccess(user, permissionModule(existing.module), true)) return errorResponse('You cannot change this record.', 403);
    const action = cleanText(body.action, 20);
    if (action === 'complete') {
      if (existing.module !== 'reminders') return errorResponse('Only reminders can be completed this way.');
      const reminderData = JSON.parse(existing.data || '{}') as Record<string, unknown>;
      const intervalValue = Number(reminderData.intervalValue || reminderData.reminderIntervalValue || 0);
      const intervalUnit = cleanText(reminderData.intervalUnit || reminderData.reminderIntervalUnit, 10) || 'months';
      const completedDate = nowIso().slice(0, 10);
      const nextDate = intervalValue > 0 ? addInterval(completedDate, intervalValue, intervalUnit) : '';
      const now = nowIso();
      const statements = [
        db().prepare("UPDATE records SET archived = 1, status = 'completed', updated_at = ? WHERE id = ?").bind(now, id),
        db().prepare('INSERT INTO audit_log (id, user_id, action, module, record_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), user.id, 'complete', 'reminders', id, `Completed ${existing.title}`, now),
      ];
      if (nextDate) {
        const nextId = crypto.randomUUID();
        statements.push(db().prepare(
          'INSERT INTO records (id, module, title, status, event_date, linked_id, data, archived, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
        ).bind(nextId, 'reminders', existing.title, 'upcoming', nextDate, existing.linked_id || existing.id, JSON.stringify({ ...reminderData, previousReminderId: id, lastCompletedDate: completedDate }), user.id, now, now));
      }
      await db().batch(statements);
      return jsonResponse({ ok: true, nextDate: nextDate || undefined });
    }
    if (action === 'archive' || action === 'restore') {
      if (!['owner','manager'].includes(user.role)) return errorResponse('Only an owner or manager can archive records.', 403);
      await db().prepare('UPDATE records SET archived = ?, updated_at = ? WHERE id = ?').bind(action === 'archive' ? 1 : 0, nowIso(), id).run();
      await audit(user.id, action, existing.module, id, `${action === 'archive' ? 'Archived' : 'Restored'} ${existing.title}`);
      return jsonResponse({ ok: true });
    }
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    const title = cleanText(body.title, 150) || existing.title;
    const status = cleanText(body.status, 30) || 'active';
    const eventDate = cleanText(body.eventDate, 20) || nowIso().slice(0, 10);
    await db().prepare('UPDATE records SET title = ?, status = ?, event_date = ?, data = ?, updated_at = ? WHERE id = ?')
      .bind(title, status, eventDate, JSON.stringify(data), nowIso(), id).run();
    await audit(user.id, 'update', existing.module, id, `Updated ${title}`);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('The record could not be updated.', 500);
  }
}
