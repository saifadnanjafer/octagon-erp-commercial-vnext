// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const { writeAudit } = require('../audit/audit');

const API_BASE = '/api/x/state';

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 4000);
}

function parseJson(text, fallback) {
  if (!text || typeof text !== 'string') return fallback;
  try { return JSON.parse(text); } catch (_) { return fallback; }
}

// T1.3.1(a): state entries may be a plain string ("draft") or an object
// carrying metadata ({ name: 'posted', terminal: true }). `terminal` and
// `immutable` are accepted as synonyms so either reads naturally in a state
// def authored by hand.
function stateName(entry) {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry === 'object') return clean(entry.name, 80);
  return '';
}

function isTerminalEntry(entry) {
  return !!(entry && typeof entry === 'object' && (entry.terminal === true || entry.immutable === true));
}

/**
 * Full-graph validation for a state-def registration (roadmap R1.3, line
 * ~130-132): every declared state must be reachable from the declared
 * initial state via the transition edges, and every transition's from/to
 * must reference a declared state. Returns { ok:true, initial } or
 * { ok:false, problems:[...] } with one human-readable Arabic problem per
 * issue found (never just the first one — the caller surfaces the full list).
 */
function validateStateDefinition(body) {
  const problems = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, problems: ['تعريف دورة الحياة يجب أن يكون كائن JSON (object)'] };
  }

  const rawStates = Array.isArray(body.states) ? body.states : [];
  if (!rawStates.length) {
    problems.push('يجب تعريف قائمة الحالات (states) بعنصر واحد على الأقل');
  }

  const stateNames = new Set();
  for (const entry of rawStates) {
    const name = stateName(entry);
    if (!name) { problems.push('اسم حالة فارغ ضمن قائمة states'); continue; }
    if (stateNames.has(name)) { problems.push(`الحالة [${name}] معرّفة أكثر من مرة في قائمة states`); continue; }
    stateNames.add(name);
  }

  const initial = clean(body.initial, 80) || (stateNames.has('draft') ? 'draft' : '');
  if (!initial) {
    problems.push('يجب تحديد الحالة الابتدائية (initial)، أو تضمين حالة باسم "draft" كافتراضي');
  } else if (!stateNames.has(initial)) {
    problems.push(`الحالة الابتدائية [${initial}] غير معرّفة في قائمة states`);
  }

  const rawTransitions = Array.isArray(body.transitions) ? body.transitions : [];
  const edges = [];
  rawTransitions.forEach((t, i) => {
    const ordinal = i + 1;
    const from = t && typeof t === 'object' ? clean(t.from, 80) : '';
    const to = t && typeof t === 'object' ? clean(t.to, 80) : '';
    const action = t && typeof t === 'object' ? clean(t.action, 80) : '';
    if (!from || !stateNames.has(from)) {
      problems.push(`الانتقال #${ordinal}: الحالة المصدر (from) [${from || '—'}] غير معرّفة في قائمة states`);
    }
    if (!to || !stateNames.has(to)) {
      problems.push(`الانتقال #${ordinal}: الحالة الهدف (to) [${to || '—'}] غير معرّفة في قائمة states`);
    }
    if (!action) {
      problems.push(`الانتقال #${ordinal}: اسم الإجراء (action) مطلوب`);
    }
    if (from && to && stateNames.has(from) && stateNames.has(to)) edges.push([from, to]);
  });

  // Reachability check only runs once references are known-valid, so the
  // problem list never mixes "undefined state" noise with "unreachable" noise.
  if (!problems.length) {
    const reachable = new Set([initial]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [from, to] of edges) {
        if (reachable.has(from) && !reachable.has(to)) { reachable.add(to); grew = true; }
      }
    }
    const unreachable = [...stateNames].filter((name) => !reachable.has(name));
    if (unreachable.length) {
      problems.push(`الحالات التالية غير قابلة للوصول من الحالة الابتدائية [${initial}] عبر مسارات الانتقال المعرّفة: ${unreachable.join('، ')}`);
    }
  }

  if (problems.length) return { ok: false, problems };
  return { ok: true, initial };
}

/**
 * T1.3.1(b): does the entity's current lifecycle definition mark `recordId`'s
 * current state as terminal/immutable? Returns null when there is no
 * lifecycle for the entity (no restriction) or the current state isn't
 * flagged terminal; otherwise an Arabic error string ready to reject a write.
 */
function terminalStateError(getDef, getDocState, entity, recordId) {
  const def = getDef(entity);
  if (!def) return null;
  const rawStates = Array.isArray(def.states) ? def.states : [];
  const current = getDocState(entity, recordId);
  const entry = rawStates.find((s) => stateName(s) === current.state);
  if (!isTerminalEntry(entry)) return null;
  return `المستند في حالة نهائية [${current.state}] ولا يمكن تعديله أو حذفه إلا عبر انتقال حالة معكوس (reversal) معرّف صراحة في دورة الحياة`;
}

function mountDocState(deps) {
  const db = deps && deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('mountDocState requires a SQLite db handle');
  }

  const sendJson = deps.sendJson || ((res, status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  });

  const readBody = deps.readRequestBody || ((req, limit = 1024 * 1024) => {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', chunk => {
        size += chunk.length;
        if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  });

  function resolveUser(req) {
    if (typeof deps.authSessionFromRequest === 'function') {
      const active = deps.authSessionFromRequest(req);
      const session = active && (active.session || active);
      if (session) {
        return {
          userId: String(session.userId || session.user?.id || 'unknown'),
          roles: Array.isArray(session.groups) ? session.groups : (session.user?.groups || []),
        };
      }
    }
    const headerUser = (req.headers || {})['x-user'] || 'local';
    const headerRoles = String((req.headers || {})['x-roles'] || (req.headers || {})['x-role'] || '').split(',').filter(Boolean);
    return { userId: headerUser, roles: headerRoles };
  }

  function getDocState(entity, recordId) {
    const row = db.prepare('SELECT state, version FROM x_doc_states WHERE entity = ? AND record_id = ?').get(entity, recordId);
    if (row) return { state: row.state, version: Number(row.version) };
    return { state: 'draft', version: 1 };
  }

  function getDef(entity) {
    const row = db.prepare('SELECT definition FROM x_doc_state_defs WHERE entity = ?').get(entity);
    if (!row) return null;
    return parseJson(row.definition, null);
  }

  function handleTransition(req, res, entity, recordId, action, body) {
    const user = resolveUser(req);
    const def = getDef(entity);
    if (!def) {
      return sendJson(res, 404, envelope(null, 'لا توجد دورة حياة محددة لهذا الكيان'));
    }

    const current = getDocState(entity, recordId);
    const transition = (def.transitions || []).find(t => t.from === current.state && t.action === action);
    if (!transition) {
      return sendJson(res, 409, envelope(null, `العملية [${action}] غير مسموح بها في الحالة الحالية [${current.state}]`));
    }

    // Role check
    if (transition.role && !user.roles.includes('admin') && !user.roles.includes(transition.role)) {
      return sendJson(res, 403, envelope(null, `صلاحية [${transition.role}] مطلوبة لتنفيذ هذا الإجراء`));
    }

    // Maker-checker separation check
    if (transition.makerChecker) {
      const creatorRow = db.prepare('SELECT created_by FROM x_records WHERE entity = ? AND id = ?').get(entity, recordId);
      const creator = creatorRow ? creatorRow.created_by : null;
      if (creator && creator === user.userId) {
        return sendJson(res, 403, envelope(null, 'قاعدة فصل المهام: لا يمكن لمنشئ المستند الموافقة عليه بنفسه'));
      }
    }

    // Concurrency version check
    const incomingVersion = Number(body.version || 0);
    if (incomingVersion && incomingVersion !== current.version) {
      return sendJson(res, 409, envelope(null, 'تم تعديل المستند بواسطة عملية أخرى. يرجى التحديث وإعادة المحاولة.'));
    }

    // Perform transition update inside transaction
    db.exec('BEGIN IMMEDIATE');
    try {
      const actualCurrent = getDocState(entity, recordId);
      if (actualCurrent.state !== current.state || actualCurrent.version !== current.version) {
        throw new Error('optimistic_lock_failed');
      }

      const nextVersion = current.version + 1;
      db.prepare(`
        INSERT INTO x_doc_states (entity, record_id, state, version)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(entity, record_id) DO UPDATE SET state = excluded.state, version = excluded.version
      `).run(entity, recordId, transition.to, nextVersion);

      const correlationId = 'corr_' + crypto.randomUUID();
      const reason = clean(body.reason, 500);

      // Write audit
      writeAudit(db, {
        entity,
        recordId,
        user: user.userId,
        action: `state_transition_${action}`,
        before: { state: current.state, version: current.version },
        after: { state: transition.to, version: nextVersion, correlationId, reason },
        at: new Date().toISOString()
      });

      // Update actual record payload in x_records with new status field
      const recordRow = db.prepare('SELECT data, company_id FROM x_records WHERE entity = ? AND id = ?').get(entity, recordId);
      if (recordRow) {
        const recordData = parseJson(recordRow.data, {});
        recordData.status = transition.to;
        db.prepare('UPDATE x_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ?')
          .run(JSON.stringify(recordData), new Date().toISOString(), entity, recordId);
      }

      db.exec('COMMIT');

      // Trigger standard VNext workflow trigger hook if matching trigger exists
      if (deps.workflowEngine && typeof deps.workflowEngine.trigger === 'function') {
        deps.workflowEngine.trigger('record', { entity, recordId, action: 'updated', record: { id: recordId, status: transition.to } });
      }

      return sendJson(res, 200, envelope({ entity, record_id: recordId, state: transition.to, version: nextVersion }));
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      if (e.message === 'optimistic_lock_failed') {
        return sendJson(res, 409, envelope(null, 'فشل القفل المتفائل: تم تعديل البيانات بشكل متزامن'));
      }
      return sendJson(res, 500, envelope(null, e.message || 'فشل تحديث الحالة'));
    }
  }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl.pathname;
    if (!pathname.startsWith(API_BASE + '/')) return false;

    const rest = pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    if (rest.length === 2 && rest[0] === 'defs' && req.method === 'POST') {
      const entity = rest[1];
      const user = resolveUser(req);
      if (!user.roles.includes('admin')) {
        return sendJson(res, 403, envelope(null, 'صلاحية مدير النظام مطلوبة لتعديل دورات الحياة'));
      }
      readBody(req).then(raw => {
        let body;
        try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) {
          return sendJson(res, 400, envelope(null, 'JSON غير صالح'));
        }

        // T1.3.1(a): full-graph validation on registration — reject with a
        // clear 400 error listing every specific problem, instead of storing
        // an arbitrary/possibly-broken graph.
        const validation = validateStateDefinition(body);
        if (!validation.ok) {
          return sendJson(res, 400, envelope(null, 'تعريف دورة الحياة غير صالح', { problems: validation.problems }));
        }

        db.prepare(
          'INSERT INTO x_doc_state_defs (entity, definition, updated_at, updated_by) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(entity) DO UPDATE SET definition = excluded.definition, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
        ).run(entity, JSON.stringify(body), new Date().toISOString(), user.userId);
        return sendJson(res, 200, envelope({ entity, definition: body, initial: validation.initial }));
      }).catch(err => sendJson(res, 500, envelope(null, err.message)));
      return true;
    }

    if (rest.length === 3 && rest[2] === 'transition' && req.method === 'POST') {
      const entity = rest[0];
      const recordId = rest[1];
      readBody(req).then(raw => {
        let body;
        try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { body = {}; }
        const action = clean(body.action, 80);
        if (!action) return sendJson(res, 400, envelope(null, 'إجراء الحالة (action) مطلوب'));
        handleTransition(req, res, entity, recordId, action, body);
      }).catch(err => sendJson(res, 500, envelope(null, err.message)));
      return true;
    }

    return false;
  }

  // T1.3.1(b): register the posted-document immutability guard with the
  // mounted CRUD engine, if one was supplied. Additive — mountDocState()
  // works exactly as before when `deps.crudEngine` is absent (e.g. in
  // isolated unit tests that only exercise the state-machine routes).
  if (deps.crudEngine && typeof deps.crudEngine.registerGuard === 'function') {
    deps.crudEngine.registerGuard((entity, recordId /*, action, beforeDoc */) =>
      terminalStateError(getDef, getDocState, entity, recordId)
    );
  }

  return { handle, getDocState, getDef };
}

module.exports = { mountDocState };
