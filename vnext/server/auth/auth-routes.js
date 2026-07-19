// clean-room; behavior modeled on platform/server/views-fields.js admin-gate pattern (proprietary self, not copied)
'use strict';

const hardening = require('./auth-hardening');

const API_BASE = '/api/x/auth';

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

/**
 * T1.14.1 completion: HTTP surface for TOTP enrollment, API-key
 * issuance/revocation, and password-policy read/validate. auth-hardening.js
 * already had working TOTP-verify-at-login, API-key validation, and
 * user-disable — none of those had a live route to actually enroll a TOTP
 * secret or issue an API key; this mounts the missing ones.
 *
 * SECRET-HANDLING: raw TOTP secrets/otpauth URIs and raw API keys are
 * placed in the JSON response body only — never passed to console.*, never
 * written back into an audit/log record by this file.
 */
function mountAuthRoutes(deps) {
  deps = deps || {};
  const db = deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('mountAuthRoutes requires a SQLite db handle');
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

  async function readJsonBody(req) {
    const raw = await readBody(req);
    if (!raw) return {};
    return JSON.parse(raw);
  }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || (pathname !== API_BASE && !pathname.startsWith(`${API_BASE}/`))) return false;
    const rest = pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);

    // POST /api/x/auth/totp/enroll — self-service, returns the secret ONCE.
    if (rest.length === 2 && rest[0] === 'totp' && rest[1] === 'enroll' && req.method === 'POST') {
      const current = requireActor(req, res); if (!current) return true;
      try {
        const enrollment = hardening.createTotpEnrollment(db, current.id);
        sendJson(res, 200, envelope(enrollment));
      } catch (error) {
        sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل بدء تسجيل المصادقة الثنائية'));
      }
      return true;
    }

    // POST /api/x/auth/totp/confirm {code} — self-service.
    if (rest.length === 2 && rest[0] === 'totp' && rest[1] === 'confirm' && req.method === 'POST') {
      const current = requireActor(req, res); if (!current) return true;
      readJsonBody(req).then((body) => {
        const code = String(body.code || '').trim();
        if (!code) return sendJson(res, 400, envelope(null, 'رمز التحقق مطلوب'));
        try {
          const confirmed = hardening.confirmTotpEnrollment(db, current.id, code);
          if (!confirmed) return sendJson(res, 401, envelope(null, 'رمز التحقق غير صحيح'));
          sendJson(res, 200, envelope({ confirmed: true }));
        } catch (error) {
          sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل تأكيد المصادقة الثنائية'));
        }
      }).catch((error) => sendJson(res, 400, envelope(null, error.message || 'JSON غير صالح')));
      return true;
    }

    // DELETE /api/x/auth/totp — remove own enrollment (admin may pass ?user_id= for another user).
    if (rest.length === 1 && rest[0] === 'totp' && req.method === 'DELETE') {
      const current = requireActor(req, res); if (!current) return true;
      const targetUserId = requestUrl.searchParams.get('user_id');
      if (targetUserId && targetUserId !== current.id && !isAdmin(current)) {
        sendJson(res, 403, envelope(null, 'صلاحية مدير النظام مطلوبة لإزالة مصادقة مستخدم آخر'));
        return true;
      }
      const removed = hardening.removeTotpEnrollment(db, targetUserId || current.id);
      sendJson(res, 200, envelope({ removed }));
      return true;
    }

    // GET /api/x/auth/password-policy — any authenticated user (client-side pre-validation UX).
    if (rest.length === 1 && rest[0] === 'password-policy' && req.method === 'GET') {
      const current = requireActor(req, res); if (!current) return true;
      sendJson(res, 200, envelope(hardening.loadPasswordPolicy(db)));
      return true;
    }

    // PUT /api/x/auth/password-policy — admin only.
    if (rest.length === 1 && rest[0] === 'password-policy' && req.method === 'PUT') {
      const current = requireAdmin(req, res); if (!current) return true;
      readJsonBody(req).then((body) => {
        sendJson(res, 200, envelope(hardening.savePasswordPolicy(db, body)));
      }).catch((error) => sendJson(res, 400, envelope(null, error.message || 'JSON غير صالح')));
      return true;
    }

    // POST /api/x/auth/password/validate {password} — no session required
    // (used during initial account setup, before a session exists). Never
    // logs the candidate password.
    if (rest.length === 2 && rest[0] === 'password' && rest[1] === 'validate' && req.method === 'POST') {
      readJsonBody(req).then((body) => {
        const policy = hardening.loadPasswordPolicy(db);
        const result = hardening.checkPasswordPolicy(body.password, policy);
        sendJson(res, 200, envelope(result));
      }).catch((error) => sendJson(res, 400, envelope(null, error.message || 'JSON غير صالح')));
      return true;
    }

    // POST /api/x/auth/api-keys {role, ttl_days?, label?, user_id?} — admin only.
    if (rest.length === 1 && rest[0] === 'api-keys' && req.method === 'POST') {
      const current = requireAdmin(req, res); if (!current) return true;
      readJsonBody(req).then((body) => {
        try {
          const issued = hardening.issueApiKey(db, {
            userId: body.user_id, role: body.role, ttlDays: body.ttl_days, label: body.label, createdBy: current.id,
          });
          sendJson(res, 201, envelope(issued));
        } catch (error) {
          sendJson(res, error.statusCode || 500, envelope(null, error.message || 'فشل إصدار مفتاح API'));
        }
      }).catch((error) => sendJson(res, 400, envelope(null, error.message || 'JSON غير صالح')));
      return true;
    }

    // GET /api/x/auth/api-keys — admin only, metadata only.
    if (rest.length === 1 && rest[0] === 'api-keys' && req.method === 'GET') {
      const current = requireAdmin(req, res); if (!current) return true;
      sendJson(res, 200, envelope(hardening.listApiKeys(db)));
      return true;
    }

    // DELETE /api/x/auth/api-keys/:id — admin only.
    if (rest.length === 2 && rest[0] === 'api-keys' && req.method === 'DELETE') {
      const current = requireAdmin(req, res); if (!current) return true;
      const removed = hardening.revokeApiKey(db, rest[1]);
      if (!removed) { sendJson(res, 404, envelope(null, 'مفتاح API غير موجود')); return true; }
      sendJson(res, 200, envelope({ id: rest[1], revoked: true }));
      return true;
    }

    sendJson(res, 404, envelope(null, 'مسار المصادقة غير موجود'));
    return true;
  }

  return { handle };
}

module.exports = { mountAuthRoutes };
