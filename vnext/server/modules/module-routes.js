// clean-room; behavior modeled on platform/server/views-fields.js admin-gate pattern (proprietary self, not copied)
'use strict';

const path = require('path');
const lifecycle = require('./module-lifecycle');

const API_BASE = '/api/x/modules';
const DEFAULT_MODULES_DIR = path.join(__dirname, 'available');

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

/**
 * T1.12.1: HTTP surface for the module/extension framework. Previously
 * `module-framework.js` was required nowhere in server.js — zero routes,
 * zero lifecycle invocation ever fired. This mounts the missing routes.
 * Admin-only, following the same `system.admin` group-check pattern as
 * `vnext/server/fields/custom-fields.js`'s `requireAdmin()`.
 */
function mountModuleRoutes(deps) {
  deps = deps || {};
  const db = deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('mountModuleRoutes requires a SQLite db handle');
  }
  const modulesDir = deps.modulesDir || DEFAULT_MODULES_DIR;

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

  // actor() is a passive identify-or-null probe; server.js's requireSession
  // side-effects a real 401/500 onto `res` in its failure branches, which
  // throws if called with no `res` at all. An inert stand-in absorbs that
  // instead of crashing the request (same fix as org-routes.js/acl-engine.js,
  // R1 integration 2026-07-18).
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

  function requireAdmin(req, res) {
    const current = actor(req);
    if (!current) {
      sendJson(res, 401, envelope(null, 'تسجيل الدخول مطلوب'));
      return null;
    }
    if (current.local || current.groups.includes('system.admin')) return current;
    sendJson(res, 403, envelope(null, 'صلاحية مدير النظام مطلوبة لإدارة الوحدات'));
    return null;
  }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || (pathname !== API_BASE && !pathname.startsWith(`${API_BASE}/`))) return false;
    const rest = pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);

    try {
      if (rest.length === 0 && req.method === 'GET') {
        const current = requireAdmin(req, res); if (!current) return true;
        sendJson(res, 200, envelope(lifecycle.listModules(db, modulesDir)));
        return true;
      }

      if (rest.length === 2 && req.method === 'POST') {
        const moduleId = rest[0];
        const action = rest[1];
        const current = requireAdmin(req, res); if (!current) return true;

        if (action === 'install') {
          readBody(req).then(() => {
            try {
              const result = lifecycle.installModule(db, modulesDir, moduleId, current.id);
              sendJson(res, 200, envelope(result));
            } catch (error) {
              sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل تثبيت الوحدة', error.extra));
            }
          }).catch((error) => sendJson(res, 500, envelope(null, error.message || 'تعذر قراءة الطلب')));
          return true;
        }

        if (action === 'uninstall') {
          try {
            const result = lifecycle.uninstallModule(db, moduleId, current.id);
            sendJson(res, 200, envelope(result));
          } catch (error) {
            sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل إلغاء تثبيت الوحدة'));
          }
          return true;
        }

        if (action === 'enable' || action === 'disable') {
          try {
            const result = lifecycle.setModuleActive(db, moduleId, action === 'enable');
            sendJson(res, 200, envelope(result));
          } catch (error) {
            sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل تحديث حالة الوحدة'));
          }
          return true;
        }
      }

      sendJson(res, 404, envelope(null, 'مسار الوحدات غير موجود'));
      return true;
    } catch (error) {
      if (!res.writableEnded) sendJson(res, error.statusCode || 500, envelope(null, error.message || 'تعذر تنفيذ الطلب'));
      return true;
    }
  }

  return { handle };
}

module.exports = { mountModuleRoutes, DEFAULT_MODULES_DIR };
