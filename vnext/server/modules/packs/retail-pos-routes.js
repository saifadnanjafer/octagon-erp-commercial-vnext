// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.3 (proprietary self, not copied)
// R9.3 Retail/POS pack HTTP routes. Thin adapter: all business rules live in
// the retail-pos engine. Routes enforce session, ACL permission, and company
// scope only. Localhost/local-dev bypass is explicitly rejected.
'use strict';
const engine = require('./retail-pos-engine');
const API_BASE = '/api/x/retail';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountRetailRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission } = deps;
  if (!db) throw new Error('mountRetailRoutes requires db');
  const write = sendJson || ((res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); });
  const read = readRequestBody || (req => new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 512 * 1024) req.destroy(); }); req.on('end', () => resolve(raw)); req.on('error', reject); }));
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function tryAuth(req) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert, { allowLocalDev: false }) : null;
    if (!session || !session.ok) return null;
    return {
      id: String(session.userId || session.user?.id || ''),
      userId: String(session.userId || session.user?.id || ''),
      groups: session.groups || [],
      role: session.user?.role || '',
      local: /^local-/.test(session.mode || '')
    };
  }

  function requireAuth(req, res, permission) {
    const user = tryAuth(req);
    if (!user) { write(res, 401, envelope(null, 'Login session required', { code: 'AUTH_REQUIRED' })); return null; }
    // Explicitly reject local-dev bypass: only real session-derived groups or
    // canonical ACL permission grants are accepted.
    const allowed = user.groups.includes('admin') || user.groups.includes('system.admin') || (typeof canPermission === 'function' && canPermission(user, permission));
    if (!allowed) { write(res, 403, envelope(null, `Permission required: ${permission}`, { code: 'FORBIDDEN' })); return null; }
    return user;
  }

  function scope(req, res, user) {
    const s = typeof resolveScope === 'function' ? resolveScope(req, { userId: user.id, groups: user.groups, user: { id: user.id } }) : { companyId: req.headers['x-company-id'] };
    if (s?.error) { write(res, s.error.status || 403, envelope(null, s.error.message, { code: s.error.code })); return null; }
    if (!s?.companyId) { write(res, 400, envelope(null, 'x-company-id is required', { code: 'COMPANY_SCOPE_REQUIRED' })); return null; }
    return String(s.companyId);
  }

  async function body(req) { const raw = await read(req); try { return raw ? JSON.parse(raw) : {}; } catch (_) { const e = new Error('Invalid JSON body'); e.statusCode = 400; e.code = 'INVALID_JSON'; throw e; } }
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'Retail request failed', { code: error.code || 'RETAIL_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    const user = requireAuth(req, res, 'retail:manage'); if (!user) return true;
    const companyId = scope(req, res, user); if (!companyId) return true;
    const run = (fn, status = 200) => body(req).then(input => write(res, status, envelope(fn(input)))).catch(e => routeError(res, e));
    try {
      if (!rest.length && req.method === 'GET') { write(res, 200, envelope(engine.listStores(db, companyId))); return true; }
      if (rest[0] === 'stores' && rest.length === 1 && req.method === 'POST') { run(input => engine.createStore(db, companyId, input, user.id), 201); return true; }
      if (rest[0] === 'stores' && rest[2] === 'shifts' && rest[3] === 'open' && req.method === 'POST') { run(input => engine.openShift(db, companyId, rest[1], input, user.id), 201); return true; }
      if (rest[0] === 'shifts' && rest[2] === 'close' && req.method === 'POST') { run(input => engine.closeShift(db, companyId, rest[1], input, user.id)); return true; }
      if (rest[0] === 'barcodes' && rest.length === 1 && req.method === 'POST') { run(input => engine.registerBarcode(db, companyId, input, user.id), 201); return true; }
      if (rest[0] === 'barcodes' && rest.length === 2 && req.method === 'GET') { write(res, 200, envelope(engine.lookupBarcode(db, companyId, rest[1]))); return true; }
      if (rest[0] === 'stores' && rest[2] === 'shifts' && rest[4] === 'scans' && req.method === 'POST') { run(input => engine.recordScan(db, companyId, rest[1], rest[3], input, user.id), 201); return true; }

      // Governed ticket operations
      if (rest[0] === 'sales' && rest.length === 1 && req.method === 'POST') { run(input => engine.postSale(db, companyId, input, user.id), 201); return true; }
      if (rest[0] === 'returns' && rest.length === 1 && req.method === 'POST') { run(input => engine.postReturn(db, companyId, input, user.id), 201); return true; }
      if (rest[0] === 'refunds' && rest.length === 1 && req.method === 'POST') { run(input => engine.postRefund(db, companyId, input, user.id), 201); return true; }
      if (rest[0] === 'tickets' && rest.length === 1 && req.method === 'GET') { write(res, 200, envelope(engine.listTickets(db, companyId, { state: url.searchParams.get('state') || undefined, store_id: url.searchParams.get('store_id') || undefined }))); return true; }
      if (rest[0] === 'tickets' && rest.length === 2 && req.method === 'GET') { write(res, 200, envelope(engine.getTicket(db, companyId, rest[1]))); return true; }
      if (rest[0] === 'tickets' && rest[2] === 'cancel' && rest.length === 3 && req.method === 'POST') { run(input => engine.cancelTicket(db, companyId, rest[1], user.id)); return true; }
      if (rest[0] === 'manifest' && rest.length === 1 && req.method === 'GET') { write(res, 200, envelope(engine.loadManifest())); return true; }
      return false;
    } catch (e) { routeError(res, e); return true; }
  }
  return { handle };
}
module.exports = { mountRetailRoutes };
