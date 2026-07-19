'use strict';
/**
 * P0.2 plain-node:http adapter for the existing ACL matrix.
 *
 * `acl.js` owns role/grant semantics and its existing Arabic matrix client.
 * That module's mountAcl() expects Express, while Octagon dispatches with
 * `handler.handle(req, res, requestUrl)`.  This add-only adapter bridges the
 * two without changing either the legacy server or P0.1 CRUD engine.
 *
 * Mount this handler BEFORE crud-engine.  It either:
 *   - handles the matrix routes itself, or
 *   - returns a 403 envelope before CRUD sees a denied /api/x request, or
 *   - returns false to let an allowed request continue to CRUD.
 *
 * Pattern re-expressed from NocoBase ACL matrix documentation and the P0.2
 * build-book contract.  No employee, attendance, timesheet, payroll, or
 * legacy collection is read or modified here.
 */

const fs = require('fs');
const path = require('path');
const acl = require('./acl');

const API_PREFIX = '/api/x/';
const WRITE_ACTIONS = new Set(['create', 'update', 'delete']);
const READ_VERBS = new Set(['read', 'list', 'summary']);
const OWNABLE_ACTIONS = new Set(['read', 'update', 'delete']);
const MAX_BODY_BYTES = 1024 * 1024;

function mountAclHttp(deps) {
  const options = deps || {};
  const db = options.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('mountAclHttp: a sqlite handle with prepare()/exec() is required');
  }
  acl.initAcl(db);

  const entitiesFile = options.entitiesFile || path.join(__dirname, 'entities.json');
  const sendJson = options.sendJson || defaultSendJson;
  const readBody = options.readRequestBody || defaultReadRequestBody;

  function loadEntities() {
    return JSON.parse(fs.readFileSync(entitiesFile, 'utf8'));
  }

  // `requireSession` is intentionally injected by server.js.  It preserves
  // Octagon's existing session lookup, localhost development admin fallback,
  // and legacy PermissionService group membership.  Harnesses may inject
  // requestUser instead, keeping tests completely isolated from database.db.
  function userFor(req, res) {
    if (req.octagonUser && typeof req.octagonUser === 'object') return req.octagonUser;
    if (typeof options.requestUser === 'function') {
      const user = options.requestUser(req, res);
      if (user && typeof user === 'object') {
        req.octagonUser = user;
        return user;
      }
      return null;
    }
    if (typeof options.requireSession === 'function') {
      const session = options.requireSession(req, res);
      if (!session || !session.ok) return null; // requireSession has answered 401/500.
      const user = {
        userId: String(session.userId || session.user?.id || ''),
        role: String(session.user?.role || session.user?.roleId || ''),
        roleId: String(session.user?.roleId || session.user?.role || ''),
        groups: Array.isArray(session.groups) ? session.groups : (session.user?.groups || []),
      };
      req.octagonUser = user;
      return user;
    }
    return null;
  }

  function forbidden(res, error, meta) {
    sendJson(res, 403, { success: false, data: null, error, meta: meta || null });
  }

  function notAuthenticated(res, perm) {
    // The adapter normally delegates this to server.js requireSession.  This
    // envelope is for standalone harnesses or a future mount missing it.
    sendJson(res, 401, {
      success: false,
      data: null,
      error: 'مطلوب تسجيل الدخول للوصول إلى هذا المورد',
      meta: { perm, code: 'NO_SESSION' },
    });
  }

  function requirePermission(req, res, user, perm) {
    if (!user) {
      // Do not write a second response when injected requireSession has
      // already ended the response.
      if (!res.writableEnded) notAuthenticated(res, perm);
      return null;
    }
    const scope = acl.scopeFor(db, user, perm);
    if (scope === null) {
      forbidden(res, `ليس لديك صلاحية تنفيذ هذا الإجراء [${perm}]`, {
        perm,
        role: acl.resolveRole(db, user),
        code: 'FORBIDDEN',
      });
      return null;
    }
    return scope;
  }

  function entityKey(entities, entity) {
    const meta = entities[entity];
    if (!meta) return null;
    return meta.acl || `${meta.section || 'platform'}:${String(entity).replace(/^[a-z0-9]+_/, '')}`;
  }

  function existingRecord(entity, recordId) {
    return db.prepare(
      'SELECT id, created_by, data FROM x_records WHERE entity = ? AND id = ? AND removed = 0'
    ).get(entity, recordId);
  }

  function mayAccessExisting(res, scope, user, entity, recordId, perm) {
    if (scope === 'all') return true;
    // No trustworthy department identity is available in the current session
    // model.  Deny rather than silently treating a dept grant as global.
    if (scope === 'dept') {
      forbidden(res, 'نطاق القسم غير متاح بعد لهذا المورد؛ تم منع الوصول حفاظاً على خصوصية البيانات', {
        perm, code: 'DEPT_SCOPE_UNAVAILABLE', scope,
      });
      return false;
    }
    const row = existingRecord(entity, recordId);
    if (!row || String(row.created_by || '') !== String(user.userId || '')) {
      forbidden(res, 'لا يمكنك الوصول إلا إلى سجلاتك الخاصة', { perm, code: 'OUT_OF_SCOPE', scope: 'own' });
      return false;
    }
    return true;
  }

  function matrixPayload() {
    const roles = db.prepare('SELECT role, label_ar FROM x_acl_roles ORDER BY role').all();
    const grants = {};
    db.prepare('SELECT role, perm, scope FROM x_acl_grants ORDER BY role, perm').all().forEach(row => {
      (grants[row.role] = grants[row.role] || []).push({ perm: row.perm, scope: row.scope });
    });
    return { roles, grants, actions: acl.ACTIONS, scopes: Object.keys(acl.SCOPE_RANK) };
  }

  function validateGrants(grants) {
    if (!Array.isArray(grants)) return 'قائمة الصلاحيات (grants) مطلوبة';
    for (const grant of grants) {
      if (!grant || typeof grant.perm !== 'string' || !grant.perm.trim()) return 'صيغة صلاحية غير صحيحة';
      if (grant.scope && !acl.SCOPE_RANK[grant.scope]) return `نطاق غير صحيح: ${grant.scope}`;
    }
    return null;
  }

  function replaceRoleGrants(role, body) {
    const error = validateGrants(body.grants);
    if (error) return { error };
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT(role) DO UPDATE SET label_ar = COALESCE(excluded.label_ar, x_acl_roles.label_ar)'
      ).run(role, body.label_ar != null ? String(body.label_ar) : null);
      db.prepare('DELETE FROM x_acl_grants WHERE role = ?').run(role);
      const insert = db.prepare('INSERT OR REPLACE INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?)');
      body.grants.forEach(grant => insert.run(role, grant.perm.trim(), acl.SCOPE_RANK[grant.scope] ? grant.scope : 'all'));
      db.exec('COMMIT');
    } catch (errorDuringWrite) {
      try { db.exec('ROLLBACK'); } catch (_) { /* no active transaction */ }
      return { error: errorDuringWrite.message || 'فشل حفظ الصلاحيات' };
    }
    return { grants: db.prepare('SELECT perm, scope FROM x_acl_grants WHERE role = ? ORDER BY perm').all(role) };
  }

  function sendOwnList(res, requestUrl, entity, user) {
    const page = Math.max(1, Number.parseInt(requestUrl.searchParams.get('page'), 10) || 1);
    const limit = Math.min(500, Math.max(1, Number.parseInt(requestUrl.searchParams.get('limit'), 10) || 20));
    const q = String(requestUrl.searchParams.get('q') || '').trim();
    const where = ['entity = ?', 'removed = 0', 'created_by = ?'];
    const params = [entity, String(user.userId || '')];
    if (q) {
      where.push("data LIKE ? ESCAPE '\\'");
      params.push('%' + q.replace(/[\\%_]/g, char => '\\' + char) + '%');
    }
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM x_records WHERE ${whereSql}`).get(...params).n;
    const rows = db.prepare(
      `SELECT id, data, created_at, updated_at, created_by, removed FROM x_records WHERE ${whereSql} ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, (page - 1) * limit).map(toDocument);
    sendJson(res, 200, { success: true, data: rows, error: null, meta: { total: Number(total), page, limit } });
  }

  function sendOwnSummary(res, entity, config, user) {
    const statusKey = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(config.status_key || 'status') ? (config.status_key || 'status') : 'status';
    const params = [entity, String(user.userId || '')];
    const total = db.prepare('SELECT COUNT(*) AS n FROM x_records WHERE entity = ? AND removed = 0 AND created_by = ?').get(...params).n;
    const rows = db.prepare(
      "SELECT COALESCE(json_extract(data, ?), '(none)') AS status, COUNT(*) AS n FROM x_records WHERE entity = ? AND removed = 0 AND created_by = ? GROUP BY 1 ORDER BY 2 DESC"
    ).all('$.' + statusKey, ...params);
    const byStatus = {};
    rows.forEach(row => { byStatus[row.status] = Number(row.n); });
    sendJson(res, 200, { success: true, data: { total: Number(total), status_key: statusKey, by_status: byStatus }, error: null, meta: null });
  }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || !pathname.startsWith(API_PREFIX)) return false;
    const segments = pathname.slice(API_PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);

    // Existing Arabic client paths: platform-admin users get the live matrix;
    // any authenticated user may obtain registry labels for harmless UI rows.
    if (segments[0] === '_meta' && segments[1] === 'entities' && segments.length === 2 && req.method === 'GET') {
      const user = userFor(req, res);
      if (!user) { if (!res.writableEnded) notAuthenticated(res, 'platform:acl:read'); return true; }
      sendJson(res, 200, { success: true, data: loadEntities(), error: null, meta: null });
      return true;
    }
    if (segments[0] === '_acl' && segments.length === 1 && req.method === 'GET') {
      const user = userFor(req, res);
      if (!requirePermission(req, res, user, 'platform:acl:read')) return true;
      sendJson(res, 200, { success: true, data: matrixPayload(), error: null, meta: null });
      return true;
    }
    if (segments[0] === '_acl' && segments.length === 2 && req.method === 'PUT') {
      const user = userFor(req, res);
      if (!requirePermission(req, res, user, 'platform:acl:update')) return true;
      const role = String(segments[1] || '').trim();
      if (!role) {
        sendJson(res, 400, { success: false, data: null, error: 'اسم الدور مطلوب', meta: null });
        return true;
      }
      readBody(req, MAX_BODY_BYTES).then(raw => {
        let body;
        try { body = raw ? JSON.parse(raw) : {}; } catch (_) {
          sendJson(res, 400, { success: false, data: null, error: 'نص JSON غير صحيح', meta: null });
          return;
        }
        const saved = replaceRoleGrants(role, body || {});
        if (saved.error) sendJson(res, 400, { success: false, data: null, error: saved.error, meta: null });
        else sendJson(res, 200, { success: true, data: { role, grants: saved.grants }, error: null, meta: null });
      }).catch(error => sendJson(res, 500, { success: false, data: null, error: error.message || 'تعذر قراءة الطلب', meta: null }));
      return true;
    }

    // P0.1's audit endpoint is a record read and must not bypass entity ACL.
    if (segments[0] === 'audit' && segments.length === 3 && req.method === 'GET') {
      const entities = loadEntities();
      const key = entityKey(entities, segments[1]);
      if (!key) return false; // CRUD sends its normal registered-entity error.
      const perm = `${key}:read`;
      const user = userFor(req, res);
      const scope = requirePermission(req, res, user, perm);
      if (!scope || !mayAccessExisting(res, scope, user, segments[1], segments[2], perm)) return true;
      return false;
    }

    const [entity, verb, recordId] = segments;
    const entities = loadEntities();
    const key = entityKey(entities, entity);
    if (!key) return false; // not a registered CRUD route; leave P0.1 behavior intact.
    if (!WRITE_ACTIONS.has(verb) && !READ_VERBS.has(verb)) return false;

    const action = WRITE_ACTIONS.has(verb) ? verb : 'read';
    const perm = `${key}:${action}`;
    const user = userFor(req, res);
    const scope = requirePermission(req, res, user, perm);
    if (!scope) return true; // 403 written before crud-engine can process it.

    // Own/dept creates are safe: the CRUD engine stamps created_by from the
    // same session. Existing records and read collections need scope checks.
    if (scope === 'dept') {
      forbidden(res, 'نطاق القسم غير متاح بعد لهذا المورد؛ تم منع الوصول حفاظاً على خصوصية البيانات', {
        perm, code: 'DEPT_SCOPE_UNAVAILABLE', scope,
      });
      return true;
    }
    if (scope === 'own' && OWNABLE_ACTIONS.has(action) && recordId) {
      if (!mayAccessExisting(res, scope, user, entity, recordId, perm)) return true;
    }
    if (scope === 'own' && verb === 'list' && req.method === 'GET') {
      sendOwnList(res, requestUrl, entity, user);
      return true;
    }
    if (scope === 'own' && verb === 'summary' && req.method === 'GET') {
      sendOwnSummary(res, entity, entities[entity], user);
      return true;
    }
    return false;
  }

  return { handle, loadEntities };
}

function toDocument(row) {
  let data = {};
  try { data = JSON.parse(row.data); } catch (_) { /* leave empty */ }
  return { ...data, id: row.id, created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by, removed: Number(row.removed) || 0 };
}

function defaultSendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.writeHead(status);
  res.end(JSON.stringify(payload));
}

function defaultReadRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = { mountAclHttp };
