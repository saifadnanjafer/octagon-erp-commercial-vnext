'use strict';
/**
 * P0.2 — ACL matrix (server side) for Octagon Commercial platform.
 *
 * Design pattern sources (ideas re-expressed, no code copied):
 *   - nocobase-main/docs/docs/en/users-permissions/acl/  (role x action x data-scope matrix)
 *   - erp-research/04-ruoyi-analysis.md                  (permission strings `bpm:model:create`,
 *                                                         row-level scope dept/self)
 *   - octagon-erp/services/permissionService.js          (legacy groups — READ ONLY compatibility)
 *
 * Storage (build book §3 — same schema as x-tables.sql, CREATE IF NOT EXISTS => idempotent):
 *   x_acl_roles(role TEXT PK, label_ar TEXT)
 *   x_acl_grants(role, perm, scope) — perm = `section:entity:action`
 *     action ∈ create/read/update/delete/approve/export
 *     scope  ∈ all/own/dept
 *     wildcards supported: `*`, `finance:*`, `factory:*:read`
 *
 * Exports:
 *   initAcl(db)                 — create tables + seed default roles (idempotent)
 *   can(db, user, perm)         — boolean
 *   scopeFor(db, user, perm)    — 'all' | 'dept' | 'own' | null (null = denied)
 *   requirePerm(db, perm)       — Express-style middleware factory; 403 envelope on deny
 *   requireEntityPerm(db, act)  — middleware; perm derived from req.params.entity via entities.json
 *   mountAcl(app, db, base)     — mounts GET /_acl, PUT /_acl/:role, GET /_meta/entities
 *   resolveRole(db, user)       — legacy bridge exposed for crud-engine / audit
 *
 * The db handle is the existing SQLite handle (node:sqlite DatabaseSync or better-sqlite3 —
 * only .exec() and .prepare().run/get/all are used, both libraries share that API).
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIONS = ['create', 'read', 'update', 'delete', 'approve', 'export'];

const SCOPE_RANK = { all: 3, dept: 2, own: 1 };

// Default roles seeded per build book P0.2 spec.
const DEFAULT_ROLES = [
  { role: 'admin', label_ar: 'مدير النظام' },
  { role: 'manager', label_ar: 'مدير' },
  { role: 'accountant', label_ar: 'محاسب' },
  { role: 'sales', label_ar: 'مبيعات' },
  { role: 'operator', label_ar: 'مشغّل' },
];

const DEFAULT_GRANTS = [
  // admin: everything
  { role: 'admin', perm: '*', scope: 'all' },
  // manager: broad business sections (NOT platform admin — that stays admin-only)
  { role: 'manager', perm: 'crm:*', scope: 'all' },
  { role: 'manager', perm: 'sales:*', scope: 'all' },
  { role: 'manager', perm: 'finance:*', scope: 'all' },
  { role: 'manager', perm: 'supply:*', scope: 'all' },
  { role: 'manager', perm: 'factory:*', scope: 'all' },
  { role: 'manager', perm: 'projects:*', scope: 'all' },
  { role: 'manager', perm: 'hr:*', scope: 'all' },
  { role: 'manager', perm: 'helpdesk:*', scope: 'all' },
  // accountant: finance section
  { role: 'accountant', perm: 'finance:*', scope: 'all' },
  // sales: crm + sales sections
  { role: 'sales', perm: 'crm:*', scope: 'all' },
  { role: 'sales', perm: 'sales:*', scope: 'all' },
  // operator: read-only over factory
  { role: 'operator', perm: 'factory:*:read', scope: 'all' },
];

// Legacy bridge — octagon-erp/services/permissionService.js groups/roles map
// onto the new x_acl_roles. Users in the legacy admin group get role 'admin'
// which holds the `*` grant.
const LEGACY_GROUP_TO_ROLE = {
  'system.admin': 'admin',
  'workshop.manager': 'manager',
  'finance.manager': 'accountant',
  'finance.user': 'accountant',
  'workshop.user': 'operator',
};

// Legacy role ids (permissionService.js ROLE_GROUPS + server ACL_SEED_USER_ROLE_OVERRIDES keys).
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

// Fallback entity registry when platform/server/entities.json is not present
// yet (P0.1 crud-engine owns that file; same 3 demo entities it seeds).
const FALLBACK_ENTITIES = {
  crm_lead: { label_ar: 'عميل محتمل', section: 'crm', acl: 'crm:lead' },
  helpdesk_ticket: { label_ar: 'تذكرة دعم', section: 'helpdesk', acl: 'helpdesk:ticket' },
  product: { label_ar: 'منتج', section: 'supply', acl: 'supply:product' },
};

// ---------------------------------------------------------------------------
// Schema + seed (idempotent)
// ---------------------------------------------------------------------------

const initializedDbs = new WeakSet();

function initAcl(db) {
  if (initializedDbs.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_acl_roles (
      role TEXT PRIMARY KEY,
      label_ar TEXT
    );
    CREATE TABLE IF NOT EXISTS x_acl_grants (
      role TEXT NOT NULL,
      perm TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'all',
      PRIMARY KEY (role, perm)
    );
  `);
  const insRole = db.prepare('INSERT OR IGNORE INTO x_acl_roles (role, label_ar) VALUES (?, ?)');
  DEFAULT_ROLES.forEach(r => insRole.run(r.role, r.label_ar));
  // Seed grants only for roles that had NO grants yet — so an admin who
  // deliberately stripped a default role's grants does not get them re-seeded
  // on every boot, while a fresh db gets the full default matrix.
  const grantCount = db.prepare('SELECT role, COUNT(*) AS n FROM x_acl_grants GROUP BY role').all();
  const seeded = new Set(grantCount.map(r => r.role));
  const insGrant = db.prepare('INSERT OR IGNORE INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?)');
  DEFAULT_GRANTS.forEach(g => {
    if (!seeded.has(g.role)) insGrant.run(g.role, g.perm, g.scope);
  });
  initializedDbs.add(db);
}

// ---------------------------------------------------------------------------
// Permission matching
// ---------------------------------------------------------------------------

/**
 * Segment-wise wildcard match.
 *   '*'               matches everything
 *   'finance:*'       matches 'finance:invoice:create' (trailing * covers the rest)
 *   'factory:*:read'  matches 'factory:workorder:read' (mid * = exactly one segment)
 */
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

/**
 * Legacy bridge: resolve a request user onto an x_acl_roles role id.
 * Order: explicit new role -> legacy role alias -> legacy groups.
 */
function resolveRole(db, user) {
  initAcl(db);
  if (!user || typeof user !== 'object') return null;
  const roleExists = db.prepare('SELECT role FROM x_acl_roles WHERE role = ?');

  const explicit = String(user.aclRole || user.role || user.roleId || '').trim();
  if (explicit) {
    if (roleExists.get(explicit)) return explicit;
    if (LEGACY_ROLE_ALIASES[explicit]) return LEGACY_ROLE_ALIASES[explicit];
  }

  const groups = Array.isArray(user.groups) ? user.groups : [];
  if (groups.includes('system.admin')) return 'admin'; // legacy admin group => full access
  // A legacy "manager" carries BOTH workshop.manager and finance.manager.
  if (groups.includes('workshop.manager') && groups.includes('finance.manager')) return 'manager';
  for (const g of groups) {
    if (LEGACY_GROUP_TO_ROLE[g]) return LEGACY_GROUP_TO_ROLE[g];
  }
  return null;
}

function grantsForRole(db, role) {
  initAcl(db);
  return db.prepare('SELECT perm, scope FROM x_acl_grants WHERE role = ?').all(role);
}

/**
 * can(db, user, perm) -> boolean.
 * user: { userId, role?/roleId?, groups?[] } — same shape requireSession() returns.
 */
function can(db, user, perm) {
  return scopeFor(db, user, perm) !== null;
}

/**
 * scopeFor(db, user, perm) -> 'all' | 'dept' | 'own' | null.
 * When several grants match, the WIDEST scope wins (all > dept > own).
 */
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

// ---------------------------------------------------------------------------
// Request user resolution
// ---------------------------------------------------------------------------

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopback(req) {
  return LOOPBACK_ADDRESSES.has(String(req?.socket?.remoteAddress || ''));
}

/**
 * The integrator sets `req.octagonUser = { userId, groups, role }` from the
 * existing octagon_session cookie flow (server.js requireSession) BEFORE the
 * /api/x router runs. Header fallback (x-octagon-user / x-octagon-role /
 * x-octagon-groups) is honored from LOOPBACK connections only — dev consoles
 * and test harnesses — mirroring server.js isLocalWriteTrusted philosophy.
 */
function resolveRequestUser(req) {
  if (req && req.octagonUser && typeof req.octagonUser === 'object') return req.octagonUser;
  if (!isLoopback(req)) return null;
  const h = (req && req.headers) || {};
  const userId = h['x-octagon-user'] || h['x-octagon-user-id'] || '';
  const role = h['x-octagon-role'] || '';
  const groups = h['x-octagon-groups']
    ? String(h['x-octagon-groups']).split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (!userId && !role && !groups.length) return null;
  return { userId: String(userId), role: String(role), groups };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function denyEnvelope(res, error, meta) {
  const body = { success: false, data: null, error, meta: meta || {} };
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(403).json(body);
  }
  // Plain node:http fallback (server.js style)
  res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/**
 * requirePerm(db, 'crm:lead:create') -> Express middleware.
 * On allow: sets req.aclUser, req.aclRole, req.aclScope then next().
 * On deny:  403 envelope { success:false, data:null, error, meta:{perm, role} }.
 */
function requirePerm(db, permString) {
  return function aclMiddleware(req, res, next) {
    const user = resolveRequestUser(req);
    if (!user) {
      return denyEnvelope(res, 'مطلوب تسجيل الدخول للوصول إلى هذا المورد', {
        perm: permString, code: 'NO_SESSION',
      });
    }
    const scope = scopeFor(db, user, permString);
    if (scope === null) {
      return denyEnvelope(res, `ليس لديك صلاحية تنفيذ هذا الإجراء [${permString}]`, {
        perm: permString, role: resolveRole(db, user), code: 'FORBIDDEN',
      });
    }
    req.aclUser = user;
    req.aclRole = resolveRole(db, user);
    req.aclScope = scope; // 'all' | 'dept' | 'own' — crud-engine applies row filtering
    if (typeof next === 'function') next();
  };
}

// ---------------------------------------------------------------------------
// Entity registry helpers (entities.json is owned by P0.1 crud-engine)
// ---------------------------------------------------------------------------

const ENTITIES_FILE = path.join(__dirname, 'entities.json');
let entitiesCache = { mtimeMs: -1, data: null };

function loadEntities() {
  try {
    const stat = fs.statSync(ENTITIES_FILE);
    if (entitiesCache.data && entitiesCache.mtimeMs === stat.mtimeMs) return entitiesCache.data;
    const data = JSON.parse(fs.readFileSync(ENTITIES_FILE, 'utf8'));
    entitiesCache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (_) {
    return FALLBACK_ENTITIES;
  }
}

/** Map an entity id to its ACL key, e.g. crm_lead -> 'crm:lead'. */
function entityAclKey(entity) {
  const reg = loadEntities();
  const meta = reg && reg[entity];
  if (meta && meta.acl) return meta.acl;
  if (meta && meta.section) return `${meta.section}:${String(entity).replace(/^[a-z0-9]+_/, '')}`;
  // Unregistered entity: conservative key under 'platform' so only admin passes.
  return `platform:${entity}`;
}

/**
 * requireEntityPerm(db, 'create') -> middleware for crud-engine routes where
 * the entity arrives as req.params.entity. Perm becomes `<aclKey>:<action>`.
 */
function requireEntityPerm(db, action) {
  return function entityAclMiddleware(req, res, next) {
    const entity = req.params && req.params.entity;
    if (!entity) {
      return denyEnvelope(res, 'كيان غير معروف', { code: 'NO_ENTITY' });
    }
    return requirePerm(db, `${entityAclKey(entity)}:${action}`)(req, res, next);
  };
}

// ---------------------------------------------------------------------------
// HTTP routes: matrix read/write + entities meta
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(body);
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/**
 * mountAcl(app, db, base='/api/x') — expects an Express-compatible app
 * (app.get/app.put with :params and JSON body on req.body).
 *
 * GET  /api/x/_acl              — full matrix { roles, grants, actions, scopes }
 * PUT  /api/x/_acl/:role        — replace grants for one role { label_ar?, grants:[{perm,scope}] }
 * GET  /api/x/_meta/entities    — entity registry for the matrix UI rows
 */
function mountAcl(app, db, base) {
  const prefix = base || '/api/x';
  initAcl(db);

  app.get(`${prefix}/_acl`, requirePerm(db, 'platform:acl:read'), (req, res) => {
    const roles = db.prepare('SELECT role, label_ar FROM x_acl_roles ORDER BY role').all();
    const rows = db.prepare('SELECT role, perm, scope FROM x_acl_grants ORDER BY role, perm').all();
    const grants = {};
    rows.forEach(r => {
      (grants[r.role] = grants[r.role] || []).push({ perm: r.perm, scope: r.scope });
    });
    sendJson(res, 200, {
      success: true,
      data: { roles, grants, actions: ACTIONS, scopes: Object.keys(SCOPE_RANK) },
      error: null,
    });
  });

  app.put(`${prefix}/_acl/:role`, requirePerm(db, 'platform:acl:update'), (req, res) => {
    const role = String((req.params && req.params.role) || '').trim();
    const body = req.body || {};
    if (!role) return sendJson(res, 400, { success: false, data: null, error: 'اسم الدور مطلوب' });
    if (!Array.isArray(body.grants)) {
      return sendJson(res, 400, { success: false, data: null, error: 'قائمة الصلاحيات (grants) مطلوبة' });
    }
    // Validate before writing anything
    for (const g of body.grants) {
      if (!g || typeof g.perm !== 'string' || !g.perm.trim()) {
        return sendJson(res, 400, { success: false, data: null, error: 'صيغة صلاحية غير صحيحة' });
      }
      if (g.scope && !SCOPE_RANK[g.scope]) {
        return sendJson(res, 400, { success: false, data: null, error: `نطاق غير صحيح: ${g.scope}` });
      }
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT(role) DO UPDATE SET label_ar = COALESCE(excluded.label_ar, x_acl_roles.label_ar)')
        .run(role, body.label_ar != null ? String(body.label_ar) : null);
      db.prepare('DELETE FROM x_acl_grants WHERE role = ?').run(role);
      const ins = db.prepare('INSERT OR REPLACE INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?)');
      body.grants.forEach(g => ins.run(role, g.perm.trim(), SCOPE_RANK[g.scope] ? g.scope : 'all'));
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
      return sendJson(res, 500, { success: false, data: null, error: error.message || 'فشل حفظ الصلاحيات' });
    }
    const saved = db.prepare('SELECT perm, scope FROM x_acl_grants WHERE role = ? ORDER BY perm').all(role);
    sendJson(res, 200, { success: true, data: { role, grants: saved }, error: null });
  });

  // Tiny meta route the matrix UI needs for its rows. Any resolvable user may
  // read it (labels only, no data). Documented for crud-engine: if P0.1 also
  // serves /_meta/entities, mount ONE of the two — they return the same shape.
  app.get(`${prefix}/_meta/entities`, (req, res) => {
    const user = resolveRequestUser(req);
    if (!user) {
      return denyEnvelope(res, 'مطلوب تسجيل الدخول للوصول إلى هذا المورد', { code: 'NO_SESSION' });
    }
    sendJson(res, 200, { success: true, data: loadEntities(), error: null });
  });
}

module.exports = {
  ACTIONS,
  SCOPE_RANK,
  initAcl,
  permMatches,
  resolveRole,
  can,
  scopeFor,
  requirePerm,
  requireEntityPerm,
  entityAclKey,
  mountAcl,
};
