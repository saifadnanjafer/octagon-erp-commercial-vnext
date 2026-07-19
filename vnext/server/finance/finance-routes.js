// clean-room; behavior modeled on platform/server/views-fields.js admin-gate pattern (proprietary self, not copied)
'use strict';

const { 
  postFiscalDoc, 
  validateBalanced, 
  reverseFiscalDoc, 
  getTrialBalance, 
  getGeneralLedger, 
  verifyHashChain,
  setLockDates,
  closeFiscalPeriod,
  reopenFiscalPeriod,
  generateClosingEntries,
  getDimensionPnLReport
} = require('./finance-engine');
const acl = require('../acl/acl-engine');

const API_BASE = '/api/x/finance';

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

function mountFinanceRoutes(deps) {
  deps = deps || {};
  const db = deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('mountFinanceRoutes requires a SQLite db handle');
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

  const INERT_PROBE_RES = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function resolveUser(req) {
    if (typeof deps.requireSession === 'function') {
      const session = deps.requireSession(req, INERT_PROBE_RES);
      if (!session || !session.ok) return null;
      return {
        userId: String(session.userId || 'unknown'),
        role: String(session.user?.role || ''),
        groups: Array.isArray(session.groups) ? session.groups : (session.user?.groups || []),
      };
    }
    if (typeof deps.authSessionFromRequest === 'function') {
      const active = deps.authSessionFromRequest(req);
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
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || (pathname !== API_BASE && !pathname.startsWith(`${API_BASE}/`))) return false;
    const rest = pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);

    try {
      // POST /api/x/finance/post
      if (rest.length === 1 && rest[0] === 'post' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:gl:post');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch (_) {
            return sendJson(res, 400, envelope(null, 'JSON غير صالح'));
          }

          const docId = String(body.doc_id || '').trim();
          if (!docId) {
            return sendJson(res, 400, envelope(null, 'معرف المستند المالي (doc_id) مطلوب'));
          }

          try {
            const result = postFiscalDoc(db, docId, auth.user.userId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            const status = err.message.includes('locked') || err.message.includes('closed') ? 409 : 500;
            sendJson(res, status, envelope(null, err.message || 'فشل ترحيل المستند المالي'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message || 'تعذر قراءة الطلب')));
        return true;
      }

      // POST /api/x/finance/reverse
      if (rest.length === 1 && rest[0] === 'reverse' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:gl:reverse');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch (_) {
            return sendJson(res, 400, envelope(null, 'JSON غير صالح'));
          }

          const docId = String(body.doc_id || '').trim();
          if (!docId) {
            return sendJson(res, 400, envelope(null, 'معرف المستند المالي (doc_id) مطلوب'));
          }

          try {
            const result = reverseFiscalDoc(db, docId, auth.user.userId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل إلغاء المستند المالي'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message || 'تعذر قراءة الطلب')));
        return true;
      }

      // POST /api/x/finance/validate
      if (rest.length === 1 && rest[0] === 'validate' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:gl:post');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch (_) {
            return sendJson(res, 400, envelope(null, 'JSON غير صالح'));
          }

          const docId = String(body.doc_id || '').trim();
          if (!docId) {
            return sendJson(res, 400, envelope(null, 'معرف المستند المالي (doc_id) مطلوب'));
          }

          const result = validateBalanced(db, docId);
          if (result.ok) {
            sendJson(res, 200, envelope({ balanced: true }));
          } else {
            sendJson(res, 200, envelope({ balanced: false, error: result.error }));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message || 'تعذر قراءة الطلب')));
        return true;
      }

      // GET /api/x/finance/trial-balance?company_id=
      if (rest.length === 1 && rest[0] === 'trial-balance' && req.method === 'GET') {
        const auth = requirePermission(req, res, 'finance:gl:view');
        if (!auth) return true;

        const companyId = requestUrl.searchParams.get('company_id');
        if (!companyId) {
          return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) مطلوب'));
        }

        const startDate = requestUrl.searchParams.get('start_date');
        const endDate = requestUrl.searchParams.get('end_date');

        try {
          const result = getTrialBalance(db, companyId, { startDate, endDate });
          sendJson(res, 200, envelope(result));
        } catch (err) {
          sendJson(res, 500, envelope(null, err.message || 'فشل جلب ميزان المراجعة'));
        }
        return true;
      }

      // GET /api/x/finance/general-ledger?company_id=&account_id=
      if (rest.length === 1 && rest[0] === 'general-ledger' && req.method === 'GET') {
        const auth = requirePermission(req, res, 'finance:gl:view');
        if (!auth) return true;

        const companyId = requestUrl.searchParams.get('company_id');
        const accountId = requestUrl.searchParams.get('account_id');
        if (!companyId || !accountId) {
          return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) ومعرف الحساب (account_id) مطلوبان'));
        }

        const startDate = requestUrl.searchParams.get('start_date');
        const endDate = requestUrl.searchParams.get('end_date');

        try {
          const result = getGeneralLedger(db, companyId, accountId, { startDate, endDate });
          sendJson(res, 200, envelope(result));
        } catch (err) {
          sendJson(res, 500, envelope(null, err.message || 'فشل جلب دفتر الأستاذ العام'));
        }
        return true;
      }

      // GET /api/x/finance/verify-chain?company_id=
      if (rest.length === 1 && rest[0] === 'verify-chain' && req.method === 'GET') {
        const auth = requirePermission(req, res, 'finance:gl:view');
        if (!auth) return true;

        const companyId = requestUrl.searchParams.get('company_id');
        if (!companyId) {
          return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) مطلوب'));
        }

        try {
          const result = verifyHashChain(db, companyId);
          sendJson(res, 200, envelope(result));
        } catch (err) {
          sendJson(res, 500, envelope(null, err.message || 'فشل التحقق من سلسلة التجزئة'));
        }
        return true;
      }

      // POST /api/x/finance/lock-dates
      if (rest.length === 1 && rest[0] === 'lock-dates' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:period:lock');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          if (!companyId) return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) مطلوب'));

          try {
            const result = setLockDates(db, companyId, {
              glLockDate: body.gl_lock_date,
              stockLockDate: body.stock_lock_date
            }, auth.user.userId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل تعيين تواريخ الإقفال'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // POST /api/x/finance/period-close
      if (rest.length === 1 && rest[0] === 'period-close' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:period:close');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          const periodId = String(body.period_id || '').trim();
          if (!companyId || !periodId) {
            return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) ومعرف الفترة (period_id) مطلوبان'));
          }

          try {
            const result = closeFiscalPeriod(db, companyId, periodId, auth.user.userId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل إغلاق الفترة المالية'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // POST /api/x/finance/period-reopen
      if (rest.length === 1 && rest[0] === 'period-reopen' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:period:reopen');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          const periodId = String(body.period_id || '').trim();
          if (!companyId || !periodId) {
            return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) ومعرف الفترة (period_id) مطلوبان'));
          }

          try {
            const result = reopenFiscalPeriod(db, companyId, periodId, auth.user.userId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل إعادة فتح الفترة المالية'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // POST /api/x/finance/generate-closing-entries
      if (rest.length === 1 && rest[0] === 'generate-closing-entries' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:period:close');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const companyId = String(body.company_id || '').trim();
          const year = Number(body.year);
          if (!companyId || !year) {
            return sendJson(res, 400, envelope(null, 'معرف الشركة (company_id) والسنة المالية (year) مطلوبان'));
          }

          try {
            const result = generateClosingEntries(db, companyId, year, auth.user.userId);
            sendJson(res, 200, envelope(result));
          } catch (err) {
            sendJson(res, 500, envelope(null, err.message || 'فشل توليد قيود الإقفال السنوية'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // POST /api/x/finance/dimension/policy
      if (rest.length === 2 && rest[0] === 'dimension' && rest[1] === 'policy' && req.method === 'POST') {
        const auth = requirePermission(req, res, 'finance:period:lock');
        if (!auth) return true;

        readBody(req).then((raw) => {
          let body;
          try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'JSON غير صالح')); }

          const accountId = String(body.account_id || '').trim();
          const dimensionId = String(body.dimension_id || '').trim();
          const policy = String(body.policy || '').trim().toLowerCase();

          if (!accountId || !dimensionId || !policy) {
            return sendJson(res, 400, envelope(null, 'البيانات المرسلة غير مكتملة (account_id, dimension_id, policy)'));
          }

          if (!['required', 'blocked', 'none'].includes(policy)) {
            return sendJson(res, 400, envelope(null, 'سياسة البعد غير صالحة (يجب أن تكون required أو blocked أو none)'));
          }

          try {
            db.exec('BEGIN IMMEDIATE TRANSACTION');
            if (policy === 'none') {
              db.prepare('DELETE FROM account_dimension_policy WHERE account_id = ? AND dimension_id = ?').run(accountId, dimensionId);
            } else {
              db.prepare(`
                INSERT INTO account_dimension_policy (id, account_id, dimension_id, policy)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(account_id, dimension_id) DO UPDATE SET policy = excluded.policy
              `).run(`pol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, accountId, dimensionId, policy);
            }
            db.exec('COMMIT');
            sendJson(res, 200, envelope({ success: true }));
          } catch (err) {
            try { db.exec('ROLLBACK'); } catch (_) {}
            sendJson(res, 500, envelope(null, err.message || 'فشل تحديث سياسة البعد للحساب'));
          }
        }).catch((err) => sendJson(res, 500, envelope(null, err.message)));
        return true;
      }

      // GET /api/x/finance/dimension/pnl
      if (rest.length === 2 && rest[0] === 'dimension' && rest[1] === 'pnl' && req.method === 'GET') {
        const auth = requirePermission(req, res, 'finance:gl:view');
        if (!auth) return true;

        const companyId = requestUrl.searchParams.get('company_id');
        const dimensionId = requestUrl.searchParams.get('dimension_id');
        const startDate = requestUrl.searchParams.get('start_date');
        const endDate = requestUrl.searchParams.get('end_date');

        if (!companyId || !dimensionId) {
          return sendJson(res, 400, envelope(null, 'البارامترات المطلوبة ناقصة (company_id, dimension_id)'));
        }

        try {
          const report = getDimensionPnLReport(db, companyId, dimensionId, { startDate, endDate });
          sendJson(res, 200, envelope(report));
        } catch (err) {
          sendJson(res, 500, envelope(null, err.message || 'فشل جلب تقرير الأبعاد المالي'));
        }
        return true;
      }

      sendJson(res, 404, envelope(null, 'مسار المالية غير موجود'));
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

module.exports = { mountFinanceRoutes };
