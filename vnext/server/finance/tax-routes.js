// clean-room; behavior modeled on platform/server/views-fields.js admin-gate pattern (proprietary self, not copied)
'use strict';

const { computeTaxes, checkAndApplyWithholding, getTaxReport } = require('./tax-engine');
const acl = require('../acl/acl-engine');

const API_BASE = '/api/x/finance/tax';

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

function mountTaxRoutes({ db, requireSession, authSessionFromRequest }) {
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
      // POST /api/x/finance/tax/compute
      if (rest.length === 1 && rest[0] === 'compute' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:gl:post');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          if (!companyId) return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) مطلوب'));

          try {
            const result = computeTaxes(db, companyId, {
              partnerId: body.partner_id,
              fiscalPositionId: body.fiscal_position_id,
              type: body.type,
              lines: body.lines || []
            });
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل حساب الضرائب'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // POST /api/x/finance/tax/withholding
      if (rest.length === 1 && rest[0] === 'withholding' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:gl:post');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          const partnerId = String(body.partner_id || '').trim();
          const amount = Number(body.amount);
          const docDate = String(body.doc_date || '').trim();

          if (!companyId || !partnerId || isNaN(amount) || !docDate) {
            return sendJson(res, 400, envelope(null, 'البيانات المرسلة غير مكتملة (company_id, partner_id, amount, doc_date)'));
          }

          try {
            const result = checkAndApplyWithholding(db, companyId, {
              partnerId,
              amount,
              docDate,
              docId: body.doc_id,
              userId: auth.user.userId
            });
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل التحقق من ضريبة الاستقطاع'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // GET /api/x/finance/tax/report?company_id=&start_date=&end_date=
      if (rest.length === 1 && rest[0] === 'report' && req.method === 'GET') {
        const auth = requirePermission(req, res, 'finance:tax:view');
        if (!auth) return true;

        const companyId = requestUrl.searchParams.get('company_id');
        const startDate = requestUrl.searchParams.get('start_date');
        const endDate = requestUrl.searchParams.get('end_date');

        if (!companyId || !startDate || !endDate) {
          return sendJson(res, 400, envelope(null, 'البارامترات المطلوبة ناقصة (company_id, start_date, end_date)'));
        }

        try {
          const report = getTaxReport(db, companyId, startDate, endDate);
          sendJson(res, 200, envelope(report));
        } catch (err) {
          sendJson(res, 500, envelope(null, err.message || 'فشل جلب تقرير الضرائب'));
        }
        return true;
      }

      sendJson(res, 404, envelope(null, 'مسار ضرائب المالية غير موجود'));
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

module.exports = { mountTaxRoutes };
