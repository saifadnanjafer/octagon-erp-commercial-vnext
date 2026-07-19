// clean-room; behavior modeled on platform/server/acl.js and platform/server/acl-http-adapter.js (proprietary self, not copied)
'use strict';

const fs = require('fs');
const path = require('path');
const { mountWorklistCounts } = require('./worklist-counts');

const ACTIONS = ['create', 'read', 'update', 'delete', 'approve', 'export'];
const SCOPE_RANK = { all: 3, dept: 2, own: 1 };

// Lazily-cached db handle: entityAclKey(entity) is called by crud-engine.js
// with a single argument (no db), so we remember the last db a mountAclHttp()
// caller handed us and fall back to it when no explicit db is passed in.
// mountCrud() and mountAclHttp() are both wired up once at server boot with
// the SAME shared sqlite handle before any HTTP request is served, so this
// cache is populated well before entityAclKey() is ever invoked at runtime.
let cachedDb = null;

const DEFAULT_ROLES = [
  { role: 'admin', label_ar: 'مدير النظام' },
  { role: 'manager', label_ar: 'مدير' },
  { role: 'accountant', label_ar: 'محاسب' },
  { role: 'sales', label_ar: 'مبيعات' },
  { role: 'operator', label_ar: 'مشغّل' },
];

const LEGACY_GROUP_TO_ROLE = {
  'system.admin': 'admin',
  'workshop.manager': 'manager',
  'finance.manager': 'accountant',
  'finance.user': 'accountant',
  'workshop.user': 'operator',
};

const LEGACY_ROLE_ALIASES = {
  system: 'admin',
  system_admin: 'admin',
  admin: 'admin',
  manager: 'manager',
  workshop_manager: 'manager',
  mgr_workshop: 'manager',
  finance_manager: 'accountant',
  mgr_finance: 'accountant',
  finance_user: 'accountant',
  user_finance: 'accountant',
  workshop_user: 'operator',
  user_workshop: 'operator',
  operator: 'operator',
  operator_user: 'operator',
  sales: 'sales',
  sales_user: 'sales',
};

function permMatches(grantPerm, perm) {
  const g = String(grantPerm || '').split(':');
  const p = String(perm || '').split(':');
  for (let i = 0; i < g.length; i++) {
    if (g[i] === '*') {
      if (i === g.length - 1) return true;
      if (i >= p.length) return false;
      continue;
    }
    if (g[i] !== p[i]) return false;
  }
  return g.length === p.length;
}

function resolveRole(db, user) {
  if (!user || typeof user !== 'object') return null;
  const roleExists = db.prepare('SELECT role FROM x_acl_roles WHERE role = ?');

  const explicit = String(user.aclRole || user.role || user.roleId || '').trim();
  if (explicit) {
    if (roleExists.get(explicit)) return explicit;
    if (LEGACY_ROLE_ALIASES[explicit]) return LEGACY_ROLE_ALIASES[explicit];
  }

  const groups = Array.isArray(user.groups) ? user.groups : [];
  if (groups.includes('system.admin')) return 'admin';
  if (groups.includes('workshop.manager') && groups.includes('finance.manager')) return 'manager';
  for (const g of groups) {
    if (LEGACY_GROUP_TO_ROLE[g]) return LEGACY_GROUP_TO_ROLE[g];
  }
  return null;
}

function grantsForRole(db, role) {
  return db.prepare('SELECT perm, scope FROM x_acl_grants WHERE role = ?').all(role);
}

function can(db, user, perm) {
  return scopeFor(db, user, perm) !== null;
}

function scopeFor(db, user, perm) {
  const role = resolveRole(db, user);
  if (!role) return null;
  let best = null;
  for (const g of grantsForRole(db, role)) {
    if (!permMatches(g.perm, perm)) continue;
    const scope = SCOPE_RANK[g.scope] ? g.scope : 'all';
    if (!best || SCOPE_RANK[scope] > SCOPE_RANK[best]) best = scope;
    if (best === 'all') break;
  }
  return best;
}

/**
 * Map an entity to its ACL permission key, e.g. crm_lead -> 'sales:crm_lead'.
 * Mirrors the client-side vnext/client/acl-admin.js#entityAclKey mapping so
 * server-issued grants (x_acl_grants.perm) and the admin UI stay in sync:
 *   1. collection_registry.acl column (explicit key) wins if present.
 *   2. Otherwise <section>:<entity without its leading "<section>_" prefix>.
 *   3. Otherwise a conservative 'platform:<entity>' key (only admin/'*' passes).
 * `db` is optional — falls back to the last db seen by mountAclHttp().
 */
function entityAclKey(entity, db) {
  const key = String(entity || '');
  const useDb = db || cachedDb;
  if (useDb) {
    try {
      const row = useDb.prepare('SELECT acl, section FROM collection_registry WHERE collection = ?').get(key);
      if (row) {
        if (row.acl) return row.acl;
        if (row.section) return `${row.section}:${key.replace(/^[a-z0-9]+_/, '')}`;
      }
    } catch (_) {
      // collection_registry may not exist yet (pre-migration) — fall through to the conservative key.
    }
  }
  return `platform:${key}`;
}

/**
 * Row-level scope predicate shared by every consumer of SCOPE_RANK
 * ({all, dept, own}) — this is the "T1.2.2 row-scope predicate" other
 * engines (chatter attachment ACL, worklist counts) apply on top of
 * scopeFor()'s coarse action grant. `record` is a plain object exposing at
 * least `created_by` and, for 'dept' scope, a `department` field.
 */
function rowScopeAllows(user, scope, record) {
  if (scope === 'all') return true;
  if (scope === 'own') return Boolean(record) && record.created_by === user.userId;
  if (scope === 'dept') {
    const userDept = String(user.department || '').trim();
    const recordDept = String((record && record.department) || '').trim();
    return Boolean(userDept) && userDept === recordDept;
  }
  return false;
}

// resolveRequestUser() is a passive "identify the caller, or return null"
// probe — callers (crud-engine.js, this module's own handle()) decide how to
// respond to a null result themselves (403/401/anonymous fallback). But
// server.js's requireSession(req, res, options) is a side-effecting
// gatekeeper: on a failed session it writes its OWN 401/500 response
// directly via `res`. Calling it here with the real `res` would risk a
// double response (requireSession sends 401, then the caller's own logic
// sends something else on the same `res`); calling it with no `res` at all
// (the previous behavior) throws inside requireSession's failure branches,
// since it does `res.setHeader(...)` unconditionally on `undefined`. This
// inert stand-in absorbs those internal response attempts silently, so a
// failed/expired/disabled session correctly resolves to `null` here instead
// of crashing the whole request with a 500.
const INERT_PROBE_RES = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

function resolveRequestUser(req, deps = {}) {
  if (req && req.octagonUser && typeof req.octagonUser === 'object') return req.octagonUser;

  if (typeof deps.requireSession === 'function') {
    const session = deps.requireSession(req, INERT_PROBE_RES);
    if (session && session.ok) {
      const user = {
        userId: String(session.userId || session.user?.id || ''),
        role: String(session.user?.role || session.user?.roleId || ''),
        roleId: String(session.user?.roleId || session.user?.role || ''),
        groups: Array.isArray(session.groups) ? session.groups : (session.user?.groups || []),
      };
      req.octagonUser = user;
      return user;
    }
  }

  // Header fallback is strictly denied unless it comes through a validated session context.
  // There is NO localhost/loopback bypass.
  return null;
}

function mountAclHttp(deps) {
  const options = deps || {};
  const db = options.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('mountAclHttp: a sqlite handle is required');
  }
  cachedDb = db;

  const worklistCounts = mountWorklistCounts(options);

  const sendJson = options.sendJson || ((res, status, payload) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  });

  const readBody = options.readRequestBody || ((req, limit) => {
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

  function forbidden(res, error, meta) {
    sendJson(res, 403, { success: false, data: null, error, meta: meta || null });
  }

  function notAuthenticated(res, perm) {
    sendJson(res, 401, {
      success: false,
      data: null,
      error: 'مطلوب تسجيل الدخول للوصول إلى هذا المورد',
      meta: { perm, code: 'NO_SESSION' },
    });
  }

  function requirePermission(req, res, user, perm) {
    if (!user) {
      if (!res.writableEnded) notAuthenticated(res, perm);
      return null;
    }
    const scope = scopeFor(db, user, perm);
    if (scope === null) {
      forbidden(res, `ليس لديك صلاحية تنفيذ هذا الإجراء [${perm}]`, {
        perm,
        role: resolveRole(db, user),
        code: 'FORBIDDEN',
      });
      return null;
    }
    return scope;
  }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || !pathname.startsWith('/api/x/')) return false;

    // T1.7.1: scoped worklist-count aggregation (GET /api/x/_worklist/counts).
    if (worklistCounts.handle(req, res, requestUrl)) return true;

    const segments = pathname.slice('/api/x/'.length).split('/').filter(Boolean).map(decodeURIComponent);

    if (segments[0] === '_acl' && segments.length === 1 && req.method === 'GET') {
      const user = resolveRequestUser(req, options);
      if (!requirePermission(req, res, user, 'platform:acl:read')) return true;
      
      const roles = db.prepare('SELECT role, label_ar FROM x_acl_roles ORDER BY role').all();
      const grants = {};
      db.prepare('SELECT role, perm, scope FROM x_acl_grants ORDER BY role, perm').all().forEach(row => {
        (grants[row.role] = grants[row.role] || []).push({ perm: row.perm, scope: row.scope });
      });
      sendJson(res, 200, {
        success: true,
        data: { roles, grants, actions: ACTIONS, scopes: Object.keys(SCOPE_RANK) },
        error: null,
      });
      return true;
    }

    if (segments[0] === '_acl' && segments.length === 2 && req.method === 'PUT') {
      const user = resolveRequestUser(req, options);
      if (!requirePermission(req, res, user, 'platform:acl:update')) return true;
      const role = String(segments[1] || '').trim();
      if (!role) {
        sendJson(res, 400, { success: false, data: null, error: 'اسم الدور مطلوب' });
        return true;
      }

      readBody(req, 1024 * 1024).then(raw => {
        let body;
        try { body = raw ? JSON.parse(raw) : {}; } catch (_) {
          sendJson(res, 400, { success: false, data: null, error: 'نص JSON غير صحيح' });
          return;
        }
        
        if (!Array.isArray(body.grants)) {
          sendJson(res, 400, { success: false, data: null, error: 'قائمة الصلاحيات مطلوبة' });
          return;
        }

        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(
            'INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT(role) DO UPDATE SET label_ar = COALESCE(excluded.label_ar, x_acl_roles.label_ar)'
          ).run(role, body.label_ar != null ? String(body.label_ar) : null);
          db.prepare('DELETE FROM x_acl_grants WHERE role = ?').run(role);
          const insert = db.prepare('INSERT OR REPLACE INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?)');
          body.grants.forEach(grant => insert.run(role, grant.perm.trim(), SCOPE_RANK[grant.scope] ? grant.scope : 'all'));
          db.exec('COMMIT');
        } catch (err) {
          try { db.exec('ROLLBACK'); } catch (_) {}
          sendJson(res, 500, { success: false, data: null, error: err.message || 'فشل حفظ الصلاحيات' });
          return;
        }

        const saved = db.prepare('SELECT perm, scope FROM x_acl_grants WHERE role = ? ORDER BY perm').all(role);
        sendJson(res, 200, { success: true, data: { role, grants: saved }, error: null });
      }).catch(err => sendJson(res, 500, { success: false, data: null, error: err.message || 'تعذر قراءة الطلب' }));

      return true;
    }

    if (segments[0] === '_acl' && segments[1] === 'fields' && segments.length === 2 && req.method === 'GET') {
      const user = resolveRequestUser(req, options);
      if (!requirePermission(req, res, user, 'platform:acl:read')) return true;
      const rules = db.prepare('SELECT role, entity, field, access FROM x_acl_field_rules ORDER BY role, entity, field').all();
      sendJson(res, 200, { success: true, data: rules, error: null });
      return true;
    }

    if (segments[0] === '_acl' && segments[1] === 'fields' && segments.length === 2 && req.method === 'PUT') {
      const user = resolveRequestUser(req, options);
      if (!requirePermission(req, res, user, 'platform:acl:update')) return true;
      readBody(req, 1024 * 1024).then(raw => {
        let body;
        try { body = raw ? JSON.parse(raw) : {}; } catch (_) {
          return sendJson(res, 400, { success: false, data: null, error: 'Invalid JSON' });
        }
        if (!Array.isArray(body.rules)) {
          return sendJson(res, 400, { success: false, data: null, error: 'rules array is required' });
        }
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('DELETE FROM x_acl_field_rules').run();
          const insert = db.prepare('INSERT OR REPLACE INTO x_acl_field_rules (role, entity, field, access) VALUES (?, ?, ?, ?)');
          body.rules.forEach(r => {
            insert.run(r.role, r.entity, r.field, r.access);
          });
          db.exec('COMMIT');
        } catch (err) {
          try { db.exec('ROLLBACK'); } catch (_) {}
          return sendJson(res, 500, { success: false, data: null, error: err.message || 'Failed to save field rules' });
        }
        sendJson(res, 200, { success: true, message: 'Field security rules updated successfully' });
      }).catch(err => sendJson(res, 500, { success: false, data: null, error: err.message }));
      return true;
    }

    return false;
  }

  return { handle, resolveRequestUser, requirePermission };
}

function maskValue(value) {
  if (value == null) return value;
  const str = String(value);
  if (str.length <= 4) return '****';
  return str.slice(0, 2) + '****' + str.slice(-2);
}

function maskFields(db, user, entity, record) {
  if (!record || typeof record !== 'object') return record;
  const role = resolveRole(db, user);
  if (!role || role === 'admin') return record;
  const rules = db.prepare('SELECT field, access FROM x_acl_field_rules WHERE role = ? AND entity = ?').all(role, entity);
  for (const rule of rules) {
    if (rule.access === 'none') {
      delete record[rule.field];
    } else if (rule.access === 'masked') {
      if (record[rule.field] !== undefined) {
        record[rule.field] = maskValue(record[rule.field]);
      }
    }
  }
  return record;
}

function checkForbiddenWrites(db, user, entity, newPayload, existingRecord = null) {
  const role = resolveRole(db, user);
  if (!role || role === 'admin') return null;
  const rules = db.prepare('SELECT field, access FROM x_acl_field_rules WHERE role = ? AND entity = ?').all(role, entity);
  for (const rule of rules) {
    if (rule.access === 'none') {
      if (newPayload[rule.field] !== undefined) {
        return `غير مسموح بكتابة الحقل المحمي [${rule.field}]`;
      }
    } else if (rule.access === 'read' || rule.access === 'masked') {
      if (newPayload[rule.field] !== undefined) {
        if (existingRecord) {
          if (newPayload[rule.field] !== existingRecord[rule.field]) {
            return `الحقل [${rule.field}] للقراءة فقط ولا يمكن تعديله`;
          }
        } else {
          if (newPayload[rule.field] != null && newPayload[rule.field] !== '') {
            return `الحقل [${rule.field}] للقراءة فقط ولا يمكن تعيينه عند الإنشاء`;
          }
        }
      }
    }
  }
  return null;
}

module.exports = {
  ACTIONS,
  SCOPE_RANK,
  permMatches,
  resolveRole,
  can,
  scopeFor,
  resolveRequestUser,
  entityAclKey,
  rowScopeAllows,
  maskFields,
  checkForbiddenWrites,
  mountAclHttp,
};

