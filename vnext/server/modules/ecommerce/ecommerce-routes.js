// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const eco = require('./ecommerce-engine');

const API_BASE = '/api/x/ecommerce';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountEcommerceRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission } = deps;
  if (!db) throw new Error('mountEcommerceRoutes requires db');
  const write = sendJson || ((res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); });
  const read = readRequestBody || (req => new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 512 * 1024) req.destroy(); }); req.on('end', () => resolve(raw)); req.on('error', reject); }));
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function tryAuth(req) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert, { allowLocalDev: false }) : null;
    if (!session || !session.ok) return null;
    return { id: String(session.userId || session.user?.id || ''), userId: String(session.userId || session.user?.id || ''), groups: session.groups || [], role: session.user?.role || '', local: /^local-/.test(session.mode || '') };
  }

  function requireAdminAuth(req, res, permission) {
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
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'eCommerce request failed', { code: error.code || 'ECOMMERCE_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    
    // Check if it is a back-office catalog publishing route
    const isManageRoute = rest.length === 3 && rest[0] === 'catalog' && (rest[2] === 'publish' || rest[2] === 'unpublish');
    
    let user = null;
    if (isManageRoute) {
      user = requireAdminAuth(req, res, 'ecommerce:manage');
      if (!user) return true;
    } else {
      user = tryAuth(req);
    }
    
    const scope = company(req, res, user); if (!scope) return true;

    try {
      // 1. Catalog publishing
      if (rest.length === 3 && rest[0] === 'catalog' && rest[2] === 'publish' && req.method === 'POST') {
        const prodId = rest[1];
        body(req).then(input => {
          write(res, 200, envelope(eco.publishProduct(db, scope.companyId, prodId, input)));
        }).catch(error => routeError(res, error));
        return true;
      }
      
      if (rest.length === 3 && rest[0] === 'catalog' && rest[2] === 'unpublish' && req.method === 'POST') {
        const prodId = rest[1];
        write(res, 200, envelope(eco.unpublishProduct(db, scope.companyId, prodId)));
        return true;
      }
      
      // 2. Public Catalog listing
      if (rest.length === 1 && rest[0] === 'catalog' && req.method === 'GET') {
        write(res, 200, envelope(eco.listOnlineCatalog(db, scope.companyId)));
        return true;
      }
      
      // 3. Cart Operations
      if (rest.length === 1 && rest[0] === 'cart') {
        if (req.method === 'POST') {
          // Get or create cart
          body(req).then(input => {
            // If user has a session, we look up if they have a portal user mapping to resolve partner_id
            let partnerId = null;
            if (user) {
              const row = db.prepare('SELECT partner_id FROM portal_user_link WHERE user_id = ? AND company_id = ?').get(user.id, scope.companyId);
              if (row) partnerId = row.partner_id;
            }
            write(res, 200, envelope(eco.getOrCreateCart(db, scope.companyId, input.session_token, partnerId)));
          }).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 2 && rest[0] === 'cart' && req.method === 'GET') {
        const cartId = rest[1];
        write(res, 200, envelope(eco.getCart(db, scope.companyId, cartId)));
        return true;
      }
      
      if (rest.length === 3 && rest[0] === 'cart' && req.method === 'POST') {
        const cartId = rest[1];
        const action = rest[2];
        
        if (action === 'add') {
          body(req).then(input => {
            write(res, 200, envelope(eco.addToCart(db, scope.companyId, cartId, input.product_id, input.qty)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (action === 'remove') {
          body(req).then(input => {
            write(res, 200, envelope(eco.removeFromCart(db, scope.companyId, cartId, input.product_id)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (action === 'checkout') {
          body(req).then(input => {
            // Resolve registered partner if user logged in
            if (user && !input.partner_id) {
              const row = db.prepare('SELECT partner_id FROM portal_user_link WHERE user_id = ? AND company_id = ?').get(user.id, scope.companyId);
              if (row) input.partner_id = row.partner_id;
            }
            write(res, 200, envelope(eco.checkoutCart(db, scope.companyId, cartId, input)));
          }).catch(error => routeError(res, error));
          return true;
        }
      }
      
      write(res, 404, envelope(null, 'eCommerce endpoint not found', { code: 'ECOMMERCE_ENDPOINT_NOT_FOUND' }));
      return true;
    } catch (error) { routeError(res, error); return true; }
  }
  return { handle };
}

module.exports = { mountEcommerceRoutes };
