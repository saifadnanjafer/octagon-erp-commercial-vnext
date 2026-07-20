// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// session; request bodies are data only.
'use strict';

const pos = require('./pos-engine');

const API_BASE = '/api/x/pos';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountPosRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission, events } = deps;
  if (!db) throw new Error('mountPosRoutes requires db');
  const write = sendJson || ((res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); });
  const read = readRequestBody || (req => new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 512 * 1024) req.destroy(); }); req.on('end', () => resolve(raw)); req.on('error', reject); }));
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function auth(req, res, permission) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert, { allowLocalDev: false }) : null;
    if (!session || !session.ok) { write(res, 401, envelope(null, 'Login session required', { code: 'AUTH_REQUIRED' })); return null; }
    const user = { id: String(session.userId || session.user?.id || ''), userId: String(session.userId || session.user?.id || ''), groups: session.groups || [], role: session.user?.role || '', local: /^local-/.test(session.mode || '') };
    const allowed = user.local || user.groups.includes('system.admin') || user.groups.includes('admin') || (typeof canPermission === 'function' && canPermission(user, permission));
    if (!allowed) { write(res, 403, envelope(null, `Permission required: ${permission}`, { code: 'FORBIDDEN' })); return null; }
    return user;
  }

  function company(req, res, user) {
    const resolved = typeof resolveScope === 'function' ? resolveScope(req, { userId: user.id, groups: user.groups, user: { id: user.id } }) : { companyId: req.headers['x-company-id'] };
    if (resolved?.error) { write(res, resolved.error.status || 403, envelope(null, resolved.error.message, { code: resolved.error.code })); return null; }
    if (!resolved?.companyId) { write(res, 400, envelope(null, 'x-company-id is required', { code: 'COMPANY_SCOPE_REQUIRED' })); return null; }
    return { companyId: String(resolved.companyId), tenantId: String(resolved.tenantId || resolved.companyId) };
  }

  async function body(req) { const raw = await read(req); try { return raw ? JSON.parse(raw) : {}; } catch (_) { const error = new Error('Invalid JSON body'); error.statusCode = 400; error.code = 'INVALID_JSON'; throw error; } }
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'POS request failed', { code: error.code || 'POS_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    if (rest[0] === 'self-order' && rest[1]) {
      if (req.method === 'GET' && rest.length === 2) { try { write(res, 200, envelope(pos.selfOrderMenu(db, rest[1]))); } catch (error) { routeError(res, error); } return true; }
      if (req.method === 'POST' && rest.length === 2) { body(req).then(input => write(res, 201, envelope(pos.createSelfOrder(db, rest[1], input)))).catch(error => routeError(res, error)); return true; }
    }
    const user = auth(req, res, req.method === 'GET' ? 'pos:view' : (rest[0] === 'sessions' && rest[2] === 'close' ? 'pos:close' : (rest[0] === 'sessions' && rest[2] === 'sales' ? 'pos:post' : 'pos:manage')));
    if (!user) return true;
    const scope = company(req, res, user); if (!scope) return true;
    const context = { ...scope, userId: user.id };
    try {
      if (rest.length === 1 && rest[0] === 'terminals' && req.method === 'GET') { write(res, 200, envelope(pos.listTerminals(db, scope.companyId))); return true; }
      if (rest.length === 1 && rest[0] === 'terminals' && req.method === 'POST') { body(req).then(input => write(res, 201, envelope(pos.createTerminal(db, scope.companyId, input, user.id)))).catch(error => routeError(res, error)); return true; }
      if (rest.length === 1 && rest[0] === 'sessions' && req.method === 'POST') { body(req).then(input => write(res, 201, envelope(pos.openSession(db, scope.companyId, input.terminal_id, input.opening_cash, user.id)))).catch(error => routeError(res, error)); return true; }
      if (rest.length === 2 && rest[0] === 'sessions' && req.method === 'GET') { write(res, 200, envelope(pos.getSession(db, scope.companyId, rest[1]))); return true; }
      if (rest.length === 3 && rest[0] === 'sessions' && rest[2] === 'sales' && req.method === 'POST') {
        body(req).then(input => {
          const key = String(req.headers['idempotency-key'] || input.idempotency_key || '').trim();
          write(res, 201, envelope(pos.syncSale(db, context, { ...input, session_id: rest[1] }, { idempotencyKey: key, runtime: { events } })));
        }).catch(error => routeError(res, error));
        return true;
      }
      if (rest.length === 3 && rest[0] === 'sessions' && rest[2] === 'close' && req.method === 'POST') {
        body(req).then(input => write(res, 200, envelope(pos.closeSession(db, scope.companyId, rest[1], input.counted_cash, user.id)))).catch(error => routeError(res, error)); return true;
      }
      write(res, 404, envelope(null, 'POS endpoint not found', { code: 'POS_NOT_FOUND' }));
      return true;
    } catch (error) { routeError(res, error); return true; }
  }
  return { handle };
}

module.exports = { mountPosRoutes };
