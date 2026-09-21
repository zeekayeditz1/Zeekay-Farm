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
  if (data.reminderEnabled === 'no') return;
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
    task: reminderTitle, nextDate, sourceModule,
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
    // eslint-disable-next-line @next/next/no-assign-module-variable -- Farm section name, not the CommonJS module object.
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
    // eslint-disable-next-line @next/next/no-assign-module-variable -- Farm section name, not the CommonJS module object.
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
    if (module === 'sales' && recordKey) {
      const animal = await db().prepare("SELECT status FROM records WHERE module = 'animals' AND record_key = ? AND archived = 0").bind(recordKey).first<{status:string}>();
      data.previousAnimalStatus = animal?.status || 'Active';
    }
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
    const existing = await db().prepare('SELECT * FROM records WHERE id = ? AND archived <> 2').bind(id).first<RecordRow>();
    if (!existing) return errorResponse('Record not found.', 404);
    if (!canAccess(user, permissionModule(existing.module), true)) return errorResponse('You cannot change this record.', 403);
    const action = cleanText(body.action, 20);
    if (existing.archived && action !== 'restore') return errorResponse('Restore this archived record before editing it.',409);
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
    if (action && action !== 'update') return errorResponse('Unknown record action.');
    const previousData = JSON.parse(existing.data || '{}') as Record<string, unknown>;
    const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? { ...previousData, ...body.data } : previousData;
    const title = cleanText(body.title, 150) || existing.title;
    const status = cleanText(body.status, 30) || existing.status;
    const eventDate = cleanText(body.eventDate, 20) || existing.event_date;
    const keyField = ({ animals: 'tag', sales: 'animalTag', fields: 'fieldNumber', equipment: 'equipmentName' } as Record<string, string>)[existing.module];
    const recordKey = Object.hasOwn(body, 'recordKey') ? cleanText(body.recordKey, 80) || null : existing.record_key;
    if (keyField && existing.record_key && !recordKey) return errorResponse('A tag or record number is required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate))) return errorResponse('Choose a valid record date.');
    const now = nowIso();
    if (existing.module === 'sales' && recordKey !== existing.record_key) {
      const animal = recordKey ? await db().prepare("SELECT status FROM records WHERE module = 'animals' AND record_key = ? AND archived = 0").bind(recordKey).first<{status:string}>() : null;
      data.previousAnimalStatus = animal?.status || 'Active';
    } else if (existing.module === 'sales') {
      data.previousAnimalStatus = previousData.previousAnimalStatus || 'Active';
    }
    const statements = [db().prepare('UPDATE records SET record_key = ?, title = ?, status = ?, event_date = ?, data = ?, updated_at = ? WHERE id = ?')
      .bind(recordKey, title, status, eventDate, JSON.stringify(data), now, id)];
    // Tags are references used throughout the farm, so a correction must travel with the history.
    if (existing.module === 'animals' && existing.record_key && recordKey !== existing.record_key) {
      for (const field of ['animalTag', 'motherId', 'offspringTag']) {
        statements.push(db().prepare(`UPDATE records SET data = json_set(data, '$.${field}', ?),
          record_key = CASE WHEN module = 'sales' AND ? = 'animalTag' THEN ? ELSE record_key END,
          title = CASE WHEN title = ? THEN ? ELSE title END, updated_at = ?
          WHERE json_extract(data, '$.${field}') = ?`).bind(recordKey, field, recordKey, existing.record_key, recordKey, now, existing.record_key));
      }
      statements.push(db().prepare("UPDATE records SET data = json_set(data, '$.linkedReference', ?), updated_at = ? WHERE module = 'reminders' AND json_extract(data, '$.linkedReference') = ?")
        .bind(recordKey, now, existing.record_key));
    }
    if (existing.module === 'fields' && existing.record_key && recordKey !== existing.record_key) {
      statements.push(db().prepare("UPDATE records SET data = json_set(data, '$.fieldNumber', ?), title = CASE WHEN title = ? THEN ? ELSE title END, updated_at = ? WHERE module = 'gur' AND json_extract(data, '$.fieldNumber') = ?")
        .bind(recordKey, existing.record_key, recordKey, now, existing.record_key));
    }
    if (existing.module === 'sales') {
      if (existing.record_key && existing.record_key !== recordKey) statements.push(resetAnimalExit(existing.record_key, id, now, cleanText(previousData.previousAnimalStatus,30)));
      if (recordKey) statements.push(db().prepare("UPDATE records SET status = ?, updated_at = ? WHERE module = 'animals' AND record_key = ? AND archived = 0").bind(status, now, recordKey));
    }
    if (existing.module !== 'reminders') {
      const reminderKeys = ['reminderEnabled','reminderTitle','reminderDate','reminderIntervalValue','reminderIntervalUnit','nextDate','nextMaintenanceDate','expectedCalvingDate'];
      const changed = reminderKeys.some(key => String(previousData[key] ?? '') !== String(data[key] ?? ''));
      if (changed) {
        statements.push(db().prepare("UPDATE records SET archived = 2, updated_at = ? WHERE module = 'reminders' AND linked_id = ? AND archived = 0").bind(now, id));
        const interval = Number(data.reminderIntervalValue || 0);
        const unit = cleanText(data.reminderIntervalUnit, 10) || 'months';
        const due = cleanText(data.reminderDate || data.nextDate || data.nextMaintenanceDate || data.expectedCalvingDate, 20) || addInterval(eventDate, interval, unit);
        if (data.reminderEnabled !== 'no' && due) {
          const task = cleanText(data.reminderTitle, 150) || defaultReminderTitle(existing.module, title, data);
          statements.push(db().prepare('INSERT INTO records (id,module,title,status,event_date,linked_id,data,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .bind(crypto.randomUUID(), 'reminders', task, 'upcoming', due, id, JSON.stringify({task,nextDate:due,sourceModule:existing.module,sourceId:id,linkedReference:data.animalTag||data.tag||data.assetName||data.equipmentName||data.fieldNumber||data.workerName||'',intervalValue:interval,intervalUnit:unit,recurrenceEnabled:interval>0?'yes':'no'}), user.id, now, now));
        }
      }
    }
    statements.push(db().prepare('INSERT INTO audit_log (id,user_id,action,module,record_id,summary,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,'update',existing.module,id,`Updated ${title}`,now));
    await db().batch(statements);
    return jsonResponse({ ok: true, id });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    if (error instanceof Error && /UNIQUE/i.test(error.message)) return errorResponse('That tag or record number is already in use.', 409);
    return errorResponse('The record could not be updated.', 500);
  }
}

function resetAnimalExit(tag: string, excludedId: string, now: string, previousStatus = 'Active') {
  return db().prepare(`UPDATE records SET status = COALESCE(
    (SELECT status FROM records WHERE module = 'sales' AND record_key = ? AND archived = 0 AND id <> ? ORDER BY event_date DESC, created_at DESC LIMIT 1),
    ?), updated_at = ?
    WHERE module = 'animals' AND record_key = ? AND archived = 0 AND status IN ('Sold','Dead','Transferred')`).bind(tag, excludedId, previousStatus || 'Active', now, tag);
}

export async function DELETE(request: Request) {
  try {
    validateOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    const existing = await db().prepare('SELECT * FROM records WHERE id = ? AND archived = 0').bind(id).first<RecordRow>();
    if (!existing) return errorResponse('Record not found.', 404);
    if (!canAccess(user, permissionModule(existing.module), true)) return errorResponse('You cannot delete this record.', 403);
    const now = nowIso();
    // Keep a private audit copy, but remove the entry and its pending follow-ups from all live views and totals.
    const statements = [
      db().prepare('UPDATE records SET archived = 2, updated_at = ? WHERE id = ?').bind(now, id),
      db().prepare("UPDATE records SET archived = 2, updated_at = ? WHERE module = 'reminders' AND linked_id = ? AND archived = 0").bind(now, id),
      db().prepare('INSERT INTO audit_log (id,user_id,action,module,record_id,summary,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), user.id, 'delete', existing.module, id, `Deleted ${existing.title}`, now),
    ];
    if (existing.module === 'sales' && existing.record_key) statements.push(resetAnimalExit(existing.record_key, id, now, cleanText(JSON.parse(existing.data || '{}').previousAnimalStatus,30)));
    await db().batch(statements);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    return errorResponse('The record could not be deleted.', 500);
  }
}
