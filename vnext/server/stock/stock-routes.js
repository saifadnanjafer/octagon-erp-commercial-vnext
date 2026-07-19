// clean-room; behavior modeled on tax-routes.js (proprietary self, not copied)
'use strict';

const { createStockMove, postStockMove, cancelStockMove, postInventoryAdjustment, rebuildBins, getValuationReport } = require('./stock-engine');
const acl = require('../acl/acl-engine');

const API_BASE = '/api/x/stock';

function envelope(data, error = null) {
  return { data, error };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', err => reject(err));
  });
}

function mountStockRoutes({ db, requireSession, authSessionFromRequest }) {
  const INERT_PROBE_RES = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function resolveUser(req) {
    if (typeof requireSession === 'function') {
      const session = requireSession(req, INERT_PROBE_RES);
      if (!session || !session.ok) return null;
      return {
        userId: String(session.userId || 'unknown'),
        role: String(session.user?.role || ''),
        groups: Array.isArray(session.groups) ? session.groups : (session.user?.groups || []),
      };
    }
    if (typeof authSessionFromRequest === 'function') {
      const active = authSessionFromRequest(req);
      const session = active && (active.session || active);
      if (session) {
        return {
          userId: String(session.userId || 'unknown'),
          role: String(session.role || ''),
          groups: Array.isArray(session.groups) ? session.groups : [],
        };
      }
    }
    const id = String((req.headers && (req.headers['x-octagon-user'] || req.headers['x-user'])) || '').trim();
    const role = String((req.headers && req.headers['x-octagon-role']) || '').trim();
    return id ? { userId: id, role, groups: role === 'admin' ? ['system.admin'] : [] } : null;
  }

  function requirePermission(req, res, perm) {
    const user = resolveUser(req);
    if (!user) {
      sendJson(res, 401, envelope(null, 'تسجيل الدخول مطلوب'));
      return null;
    }
    const scope = acl.scopeFor(db, user, perm);
    if (scope === null) {
      sendJson(res, 403, envelope(null, `صلاحية [${perm}] مطلوبة للوصول إلى هذا المورد`));
      return null;
    }
    return { user, scope };
  }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl.pathname;
    if (!pathname.startsWith(API_BASE)) {
      return false;
    }

    const sub = pathname.substring(API_BASE.length);
    const rest = sub.split('/').filter(x => x);

    try {
      // POST /api/x/stock/move
      if (rest.length === 1 && rest[0] === 'move' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'stock:move:create');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          if (!companyId) return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) مطلوب'));

          try {
            const result = createStockMove(db, companyId, body);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل إنشاء حركة المخزون'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // POST /api/x/stock/move/post
      if (rest.length === 2 && rest[0] === 'move' && rest[1] === 'post' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'stock:move:post');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          const moveId = String(body.move_id || '').trim();
          if (!companyId || !moveId) {
            return sendJson(res, 400, envelope(null, 'البيانات المرسلة غير مكتملة (company_id, move_id)'));
          }

          try {
            const result = postStockMove(db, companyId, moveId, auth.user.userId, body);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل ترحيل حركة المخزون'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // POST /api/x/stock/move/cancel
      if (rest.length === 2 && rest[0] === 'move' && rest[1] === 'cancel' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'stock:move:cancel');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          const moveId = String(body.move_id || '').trim();
          if (!companyId || !moveId) {
            return sendJson(res, 400, envelope(null, 'البيانات المرسلة غير مكتملة (company_id, move_id)'));
          }

          try {
            const result = cancelStockMove(db, companyId, moveId, auth.user.userId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل إلغاء حركة المخزون'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // GET /api/x/stock/valuation
      if (rest.length === 1 && rest[0] === 'adjustment' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'stock:adjustment:post');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }
          const companyId = String(body.company_id || '').trim();
          if (!companyId || !body.location_id || !body.product_id || body.counted_qty === undefined || body.counted_rate === undefined) {
            return sendJson(res, 400, envelope(null, 'company_id, location_id, product_id, counted_qty, and counted_rate are required'));
          }
          try {
            const result = postInventoryAdjustment(db, companyId, body, auth.user.userId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            const status = /locked|closed|authorization|required|inconsistent|different company/i.test(err.message || '') ? 409 : 500;
            sendJson(res, status, envelope(null, err.message || 'Inventory adjustment failed'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // GET /api/x/stock/valuation
      if (rest.length === 1 && rest[0] === 'valuation' && req.method === 'GET') {
        const auth = requirePermission(req, res, 'stock:valuation:view');
        if (!auth) return true;

        const companyId = requestUrl.searchParams.get('company_id');
        const locationId = requestUrl.searchParams.get('location_id');
        const productId = requestUrl.searchParams.get('product_id');
        const asOf = requestUrl.searchParams.get('as_of');

        if (!companyId) {
          return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) مطلوب'));
        }

        try {
          const result = getValuationReport(db, companyId, locationId, productId, asOf);
          sendJson(res, 200, envelope(result));
        } catch (err) {
          sendJson(res, 500, envelope(null, err.message || 'فشل جلب تقرير تقييم المخزون'));
        }
        return true;
      }

      // POST /api/x/stock/rebuild-bins
      if (rest.length === 1 && rest[0] === 'rebuild-bins' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'stock:move:post');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          const locationId = String(body.location_id || '').trim();
          const productId = String(body.product_id || '').trim();
          if (!companyId || !locationId || !productId) {
            return sendJson(res, 400, envelope(null, 'البيانات المرسلة غير مكتملة (company_id, location_id, product_id)'));
          }

          try {
            const result = rebuildBins(db, companyId, locationId, productId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل إعادة بناء الأرصدة'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      sendJson(res, 404, envelope(null, 'مسار حركات المخزون غير موجود'));
      return true;
    } catch (error) {
      if (!res.writableEnded) {
        sendJson(res, 500, envelope(null, error.message || 'تعذر تنفيذ الطلب'));
      }
      return true;
    }
  }

  return { handle };
}

module.exports = { mountStockRoutes };
