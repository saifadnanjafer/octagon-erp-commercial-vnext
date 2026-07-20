// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.4 (proprietary self, not copied)
// R9.4 marketplace pack distribution HTTP routes. Thin adapter: every
// verification, compatibility, entitlement, and lifecycle decision lives in
// marketplace-engine.js. Routes enforce session, ACL permission, and company
// scope only. Localhost/local-dev bypass is explicitly rejected, matching the
// R9.3 Retail/POS route convention.
'use strict';
const engine = require('./marketplace-engine');
const API_BASE = '/api/x/marketplace';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountMarketplaceRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission } = deps;
  if (!db) throw new Error('mountMarketplaceRoutes requires db');
  const write = sendJson || ((res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); });
  const read = readRequestBody || (req => new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 8 * 1024 * 1024) req.destroy(); }); req.on('end', () => resolve(raw)); req.on('error', reject); }));
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function tryAuth(req) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert, { allowLocalDev: false }) : null;
    if (!session || !session.ok) return null;
    return {
      id: String(session.userId || session.user?.id || ''),
      userId: String(session.userId || session.user?.id || ''),
      groups: session.groups || [],
      role: session.user?.role || '',
      local: /^local-/.test(session.mode || ''),
    };
  }

  function requireAuth(req, res, permission) {
    const user = tryAuth(req);
    if (!user) { write(res, 401, envelope(null, 'Login session required', { code: 'AUTH_REQUIRED' })); return null; }
    if (user.local) { write(res, 403, envelope(null, 'Local development sessions are rejected', { code: 'LOCAL_DEV_REJECTED' })); return null; }
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
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'Marketplace request failed', { code: error.code || 'MARKETPLACE_ERROR', reasons: error.reasons || undefined })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    const user = requireAuth(req, res, 'marketplace:manage'); if (!user) return true;
    const companyId = scope(req, res, user); if (!companyId) return true;
    const run = (fn, status = 200) => body(req).then(input => write(res, status, envelope(fn(input)))).catch(e => routeError(res, e));

    try {
      if (rest[0] === 'signers' && rest.length === 1 && req.method === 'GET') { write(res, 200, envelope(engine.listSigners(db, companyId))); return true; }
      if (rest[0] === 'signers' && rest.length === 1 && req.method === 'POST') { run(input => engine.registerSigner(db, companyId, input, user.id), 201); return true; }
      if (rest[0] === 'signers' && rest[2] === 'revoke' && req.method === 'POST') { run(input => engine.revokeSigner(db, companyId, rest[1], input, user.id)); return true; }

      if (rest[0] === 'catalog' && rest.length === 1 && req.method === 'GET') { write(res, 200, envelope(engine.listCatalog(db, companyId))); return true; }
      if (rest[0] === 'catalog' && rest.length === 2 && req.method === 'GET') { write(res, 200, envelope(engine.getPack(db, companyId, rest[1]))); return true; }
      if (rest[0] === 'catalog' && rest[2] === 'preview' && req.method === 'POST') { write(res, 200, envelope(engine.previewInstall(db, companyId, rest[1]))); return true; }
      if (rest[0] === 'catalog' && rest[2] === 'install' && req.method === 'POST') { run(input => engine.installPack(db, companyId, rest[1], user.id, input.idempotency_key), 201); return true; }
      if (rest[0] === 'catalog' && rest[2] === 'upgrade' && req.method === 'POST') { run(input => engine.upgradePack(db, companyId, rest[1], user.id, input.idempotency_key)); return true; }
      if (rest[0] === 'catalog' && rest[2] === 'disable' && req.method === 'POST') { run(() => engine.disablePack(db, companyId, rest[1], user.id)); return true; }
      if (rest[0] === 'catalog' && rest[2] === 'enable' && req.method === 'POST') { run(() => engine.enablePack(db, companyId, rest[1], user.id)); return true; }
      if (rest[0] === 'catalog' && rest[2] === 'uninstall' && req.method === 'POST') { run(() => engine.uninstallPack(db, companyId, rest[1], user.id)); return true; }

      if (rest[0] === 'import' && rest.length === 1 && req.method === 'POST') { run(input => engine.importPackage(db, companyId, input, user.id), 201); return true; }
      if (rest[0] === 'conformance' && rest.length === 2 && req.method === 'GET') { write(res, 200, envelope(engine.checkConformance(db, companyId, rest[1]))); return true; }
      return false;
    } catch (e) { routeError(res, e); return true; }
  }
  return { handle };
}
module.exports = { mountMarketplaceRoutes };
