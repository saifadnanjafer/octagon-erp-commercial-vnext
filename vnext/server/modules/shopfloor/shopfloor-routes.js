// R7.1 thin HTTP adapter for shop-floor execution terminals.
'use strict';

const shop = require('./shopfloor-engine');

const API_BASE = '/api/x/shopfloor';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountShopfloorRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission } = deps;
  if (!db) throw new Error('mountShopfloorRoutes requires db');
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
    const allowed = user.local || user.groups.includes('system.admin') || user.groups.includes('admin') || user.groups.includes('production') || (typeof canPermission === 'function' && canPermission(user, permission));
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
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'Shop Floor request failed', { code: error.code || 'SHOP_FLOOR_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    
    // Check login endpoint first (kiosk login only requires company scope, not session)
    const isLogin = rest.length === 1 && rest[0] === 'login';
    
    let user = null;
    if (!isLogin) {
      let requiredPerm = 'shopfloor:view';
      if (req.method === 'POST') {
        requiredPerm = 'shopfloor:manage';
      }
      user = requireAuth(req, res, requiredPerm);
      if (!user) return true;
    }
    
    const scope = company(req, res, user); if (!scope) return true;

    try {
      if (rest.length === 1 && rest[0] === 'login' && req.method === 'POST') {
        body(req).then(input => {
          write(res, 200, envelope(shop.loginOperator(db, scope.companyId, input.badge_pin)));
        }).catch(error => routeError(res, error));
        return true;
      }
      
      if (rest.length === 1 && rest[0] === 'operators') {
        if (req.method === 'POST') {
          body(req).then(input => {
            write(res, 201, envelope(shop.createOperator(db, scope.companyId, input)));
          }).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 3 && rest[0] === 'work-orders') {
        const woId = rest[1];
        const action = rest[2];
        
        if (action === 'action' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(shop.logWorkOrderAction(db, scope.companyId, input.operator_id, woId, input.action, input.qty_produced, input.qty_scrapped, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (action === 'issue' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(shop.issueMaterial(db, scope.companyId, woId, input.product_id, input.qty, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (action === 'state' && req.method === 'GET') {
          write(res, 200, envelope(shop.getWorkOrderTerminalState(db, scope.companyId, woId)));
          return true;
        }
      }
      
      write(res, 404, envelope(null, 'Shop Floor endpoint not found', { code: 'SHOP_FLOOR_ENDPOINT_NOT_FOUND' }));
      return true;
    } catch (error) { routeError(res, error); return true; }
  }
  return { handle };
}

module.exports = { mountShopfloorRoutes };
