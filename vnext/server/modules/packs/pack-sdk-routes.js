// R9.1 thin HTTP adapter for Pack SDK management.
'use strict';

const packSdk = require('./pack-sdk-engine');

const API_BASE = '/api/x/packs';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountPackRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission } = deps;
  if (!db) throw new Error('mountPackRoutes requires db');
  const write = sendJson || ((res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); });
  const read = readRequestBody || (req => new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 512 * 1024) req.destroy(); }); req.on('end', () => resolve(raw)); req.on('error', reject); }));
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function tryAuth(req) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert, { allowLocalDev: false }) : null;
    if (!session || !session.ok) return null;
    return { id: String(session.userId || session.user?.id || ''), userId: String(session.userId || session.user?.id || ''), groups: session.groups || [], role: session.user?.role || '', local: /^local-/.test(session.mode || '') };
  }

  function requireAuth(req, res, permission) {
    const user = tryAuth(req);
    if (!user) { write(res, 401, envelope(null, 'Login session required', { code: 'AUTH_REQUIRED' })); return null; }
    const allowed = user.local || user.groups.includes('system.admin') || user.groups.includes('admin') || (typeof canPermission === 'function' && canPermission(user, permission));
    if (!allowed) { write(res, 403, envelope(null, `Permission required: ${permission}`, { code: 'FORBIDDEN' })); return null; }
    return user;
  }

  function company(req, res, user) {
    const resolved = typeof resolveScope === 'function' ? resolveScope(req, user ? { userId: user.id, groups: user.groups, user: { id: user.id } } : undefined) : { companyId: req.headers['x-company-id'] };
    if (resolved?.error) { write(res, resolved.error.status || 403, envelope(null, resolved.error.message, { code: resolved.error.code })); return null; }
    if (!resolved?.companyId) { write(res, 400, envelope(null, 'x-company-id is required', { code: 'COMPANY_SCOPE_REQUIRED' })); return null; }
    return { companyId: String(resolved.companyId), tenantId: String(resolved.tenantId || resolved.companyId) };
  }

  async function body(req) { const raw = await read(req); try { return raw ? JSON.parse(raw) : {}; } catch (_) { const error = new Error('Invalid JSON body'); error.statusCode = 400; error.code = 'INVALID_JSON'; throw error; } }
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'Pack SDK request failed', { code: error.code || 'PACK_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);

    const user = requireAuth(req, res, 'packs:manage');
    if (!user) return true;

    const scope = company(req, res, user); if (!scope) return true;

    try {
      // GET /api/x/packs — list installed packs
      if (rest.length === 0 && req.method === 'GET') {
        write(res, 200, envelope(packSdk.listPacks(db, scope.companyId)));
        return true;
      }

      // POST /api/x/packs/install — install a pack
      if (rest.length === 1 && rest[0] === 'install' && req.method === 'POST') {
        body(req).then(manifest => {
          write(res, 201, envelope(packSdk.installPack(db, scope.companyId, manifest)));
        }).catch(error => routeError(res, error));
        return true;
      }

      // POST /api/x/packs/uninstall — uninstall a pack
      if (rest.length === 1 && rest[0] === 'uninstall' && req.method === 'POST') {
        body(req).then(input => {
          write(res, 200, envelope(packSdk.uninstallPack(db, scope.companyId, input.pack_id)));
        }).catch(error => routeError(res, error));
        return true;
      }

      // GET /api/x/packs/conformance/:packId — check conformance
      if (rest.length === 2 && rest[0] === 'conformance' && req.method === 'GET') {
        write(res, 200, envelope(packSdk.checkConformance(db, scope.companyId, rest[1])));
        return true;
      }

      return false;
    } catch (error) { routeError(res, error); return true; }
  }
  return { handle };
}

module.exports = { mountPackRoutes };
