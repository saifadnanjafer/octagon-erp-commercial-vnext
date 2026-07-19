// clean-room; behavior modeled on platform/server/views-fields.js admin-gate pattern (proprietary self, not copied)
'use strict';

const org = require('./org-structures');

const API_BASE = '/api/x/org';

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

/**
 * T1.13.1 completion: HTTP surface for the organization/fiscal masters.
 * Previously org-structures.js was required nowhere in server.js — no
 * `/api/org` or `/api/compan*` route existed at all. This mounts:
 * companies/branches/departments/warehouses listing, the one-action
 * fiscal-year generator, company-access grants, and the active-company
 * selection endpoint the new company-switcher UI calls.
 */
function mountOrgRoutes(deps) {
  deps = deps || {};
  const db = deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('mountOrgRoutes requires a SQLite db handle');
  }

  const sendJson = deps.sendJson || ((res, status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  });

  const readBody = deps.readRequestBody || ((req, limit = 64 * 1024) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  }));

  // actor() is a passive "identify the caller, or return null" probe —
  // requireActor() below decides how to respond to a null result (401 via
  // the REAL res). server.js's requireSession(req, res, options) is a
  // side-effecting gatekeeper: on a failed session it writes its own
  // 401/500 response straight to `res` (unconditional `sendJson(res, ...)`
  // in its failure branches). Calling it here with no `res` at all throws
  // (`res.setHeader` on undefined) instead of resolving to "no user" —
  // exactly the same class of bug fixed in acl-engine.js's
  // resolveRequestUser() during R1 integration (2026-07-18), found again
  // here by actually mounting the company-switcher widget against this
  // route live. An inert stand-in absorbs those internal response attempts
  // silently so a missing/expired session resolves to `null` here instead
  // of crashing the request.
  const INERT_PROBE_RES = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function actor(req) {
    if (typeof deps.requireSession === 'function') {
      const session = deps.requireSession(req, INERT_PROBE_RES);
      if (!session || !session.ok) return null;
      return { id: String(session.userId || 'unknown'), groups: Array.isArray(session.groups) ? session.groups : [], local: /^local-/.test(session.mode || '') };
    }
    if (typeof deps.authSessionFromRequest === 'function') {
      const active = deps.authSessionFromRequest(req);
      const session = active && (active.session || active);
      if (session) {
        return { id: String(session.userId || 'unknown'), groups: Array.isArray(session.groups) ? session.groups : [], local: false };
      }
      return null;
    }
    const id = String((req.headers && (req.headers['x-octagon-user'] || req.headers['x-user'])) || '').trim();
    const role = String((req.headers && req.headers['x-octagon-role']) || '').trim();
    return id ? { id, groups: role === 'admin' ? ['system.admin'] : [], local: false } : null;
  }

  function requireActor(req, res) {
    const current = actor(req);
    if (!current) { sendJson(res, 401, envelope(null, 'تسجيل الدخول مطلوب')); return null; }
    return current;
  }

  function isAdmin(current) {
    return !!(current && (current.local || current.groups.includes('system.admin')));
  }

  function requireAdmin(req, res) {
    const current = requireActor(req, res);
    if (!current) return null;
    if (isAdmin(current)) return current;
    sendJson(res, 403, envelope(null, 'صلاحية مدير النظام مطلوبة'));
    return null;
  }

  function requireCompanyAccess(req, res, current, companyId) {
    if (!companyId) { sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) مطلوب')); return false; }
    if (!org.getCompany(db, companyId)) { sendJson(res, 404, envelope(null, 'الشركة غير موجودة')); return false; }
    if (!org.userHasCompanyAccess(db, current.id, companyId, isAdmin(current))) {
      sendJson(res, 403, envelope(null, 'لا تملك صلاحية الوصول إلى هذه الشركة'));
      return false;
    }
    return true;
  }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || (pathname !== API_BASE && !pathname.startsWith(`${API_BASE}/`))) return false;
    const rest = pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);

    try {
      // GET /api/x/org/companies — accessible companies (admin sees all)
      if (rest.length === 1 && rest[0] === 'companies' && req.method === 'GET') {
        const current = requireActor(req, res); if (!current) return true;
        if (isAdmin(current)) {
          const all = org.listCompanies(db);
          const accessible = new Map(org.listUserCompanies(db, current.id).map((c) => [c.company_id, c.is_default]));
          sendJson(res, 200, envelope(all.map((c) => ({ ...c, is_default: !!accessible.get(c.company_id) }))));
        } else {
          sendJson(res, 200, envelope(org.listUserCompanies(db, current.id)));
        }
        return true;
      }

      // POST /api/x/org/companies/:id/access — admin grants a user access
      if (rest.length === 3 && rest[0] === 'companies' && rest[2] === 'access' && req.method === 'POST') {
        const current = requireAdmin(req, res); if (!current) return true;
        const companyId = rest[1];
        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }
          const userId = String(body.user_id || '').trim();
          if (!userId) return sendJson(res, 400, envelope(null, 'معرف المستخدم (user_id) مطلوب'));
          try {
            const result = org.grantUserCompanyAccess(db, userId, companyId, !!body.is_default);
            sendJson(res, 200, envelope(result));
          } catch (error) {
            sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل منح صلاحية الوصول'));
          }
        }).catch((error) => sendJson(res, 500, envelope(null, error.message || 'تعذر قراءة الطلب')));
        return true;
      }

      // GET /api/x/org/branches?company_id=
      if (rest.length === 1 && rest[0] === 'branches' && req.method === 'GET') {
        const current = requireActor(req, res); if (!current) return true;
        const companyId = requestUrl.searchParams.get('company_id');
        if (!requireCompanyAccess(req, res, current, companyId)) return true;
        sendJson(res, 200, envelope(org.listBranches(db, companyId)));
        return true;
      }

      // GET /api/x/org/departments?company_id=
      if (rest.length === 1 && rest[0] === 'departments' && req.method === 'GET') {
        const current = requireActor(req, res); if (!current) return true;
        const companyId = requestUrl.searchParams.get('company_id');
        if (!requireCompanyAccess(req, res, current, companyId)) return true;
        sendJson(res, 200, envelope(org.listDepartments(db, companyId)));
        return true;
      }

      // GET /api/x/org/warehouses?company_id=
      if (rest.length === 1 && rest[0] === 'warehouses' && req.method === 'GET') {
        const current = requireActor(req, res); if (!current) return true;
        const companyId = requestUrl.searchParams.get('company_id');
        if (!requireCompanyAccess(req, res, current, companyId)) return true;
        sendJson(res, 200, envelope(org.listWarehouses(db, companyId)));
        return true;
      }

      // POST /api/x/org/fiscal-years/generate {company_id, year, periods_per_year?}
      if (rest.length === 2 && rest[0] === 'fiscal-years' && rest[1] === 'generate' && req.method === 'POST') {
        const current = requireAdmin(req, res); if (!current) return true;
        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }
          try {
            const result = org.generateFiscalYear(db, body.company_id, body.year, { periodsPerYear: body.periods_per_year });
            sendJson(res, 200, envelope(result));
          } catch (error) {
            sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل توليد السنة المالية'));
          }
        }).catch((error) => sendJson(res, 500, envelope(null, error.message || 'تعذر قراءة الطلب')));
        return true;
      }

      // GET /api/x/org/active-company
      if (rest.length === 1 && rest[0] === 'active-company' && req.method === 'GET') {
        const current = requireActor(req, res); if (!current) return true;
        sendJson(res, 200, envelope(org.getActiveCompany(db, current.id)));
        return true;
      }

      // POST /api/x/org/active-company {company_id}
      if (rest.length === 1 && rest[0] === 'active-company' && req.method === 'POST') {
        const current = requireActor(req, res); if (!current) return true;
        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }
          try {
            const result = org.setActiveCompany(db, current.id, body.company_id, isAdmin(current));
            sendJson(res, 200, envelope(result));
          } catch (error) {
            sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل تعيين الشركة النشطة'));
          }
        }).catch((error) => sendJson(res, 500, envelope(null, error.message || 'تعذر قراءة الطلب')));
        return true;
      }

      sendJson(res, 404, envelope(null, 'مسار المؤسسة غير موجود'));
      return true;
    } catch (error) {
      if (!res.writableEnded) sendJson(res, error.statusCode || 500, envelope(null, error.message || 'تعذر تنفيذ الطلب'));
      return true;
    }
  }

  return { handle };
}

module.exports = { mountOrgRoutes };
