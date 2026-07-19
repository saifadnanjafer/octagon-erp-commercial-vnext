// R6.4 thin HTTP adapter for customer and vendor portals.
'use strict';

const port = require('./portal-engine');

const API_BASE = '/api/x/portal';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountPortalRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission } = deps;
  if (!db) throw new Error('mountPortalRoutes requires db');
  const write = sendJson || ((res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); });
  const read = readRequestBody || (req => new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 512 * 1024) req.destroy(); }); req.on('end', () => resolve(raw)); req.on('error', reject); }));
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function auth(req, res, permission) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert, { allowLocalDev: false }) : null;
    if (!session || !session.ok) { write(res, 401, envelope(null, 'Login session required', { code: 'AUTH_REQUIRED' })); return null; }
    const user = { id: String(session.userId || session.user?.id || ''), userId: String(session.userId || session.user?.id || ''), groups: session.groups || [], role: session.user?.role || '', local: /^local-/.test(session.mode || '') };
    const allowed = user.local || user.groups.includes('system.admin') || user.groups.includes('admin') || user.groups.includes('portal') || (typeof canPermission === 'function' && canPermission(user, permission));
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
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'Portal request failed', { code: error.code || 'PORTAL_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    
    // Determining required permission
    let requiredPerm = 'portal:access';
    if (rest.length === 1 && rest[0] === 'link') {
      requiredPerm = 'portal:manage';
    }
    
    const user = auth(req, res, requiredPerm);
    if (!user) return true;
    const scope = company(req, res, user); if (!scope) return true;

    try {
      if (rest.length === 1 && rest[0] === 'link' && req.method === 'POST') {
        body(req).then(input => {
          write(res, 200, envelope(port.linkPortalUser(db, scope.companyId, input.user_id, input.partner_id)));
        }).catch(error => routeError(res, error));
        return true;
      }
      
      // Customer Portal endpoints
      if (rest.length === 2 && rest[0] === 'customer' && rest[1] === 'dashboard' && req.method === 'GET') {
        write(res, 200, envelope(port.getCustomerDashboard(db, scope.companyId, user.id)));
        return true;
      }
      
      if (rest.length === 2 && rest[0] === 'customer' && rest[1] === 'quotes' && req.method === 'GET') {
        write(res, 200, envelope(port.listCustomerQuotes(db, scope.companyId, user.id)));
        return true;
      }
      
      if (rest.length === 4 && rest[0] === 'customer' && rest[1] === 'quotes' && rest[3] === 'approve' && req.method === 'POST') {
        const quoteId = rest[2];
        body(req).then(input => {
          write(res, 200, envelope(port.approveQuote(db, scope.companyId, user.id, quoteId, input.signature)));
        }).catch(error => routeError(res, error));
        return true;
      }
      
      if (rest.length === 2 && rest[0] === 'customer' && rest[1] === 'invoices' && req.method === 'GET') {
        write(res, 200, envelope(port.listCustomerInvoices(db, scope.companyId, user.id)));
        return true;
      }
      
      if (rest.length === 2 && rest[0] === 'customer' && rest[1] === 'tickets' && req.method === 'GET') {
        write(res, 200, envelope(port.listCustomerTickets(db, scope.companyId, user.id)));
        return true;
      }
      
      if (rest.length === 2 && rest[0] === 'customer' && rest[1] === 'statement' && req.method === 'GET') {
        const start = url.searchParams.get('start_date') || undefined;
        const end = url.searchParams.get('end_date') || undefined;
        write(res, 200, envelope(port.getCustomerAccountStatement(db, scope.companyId, user.id, start, end)));
        return true;
      }
      
      // Vendor Portal endpoints
      if (rest.length === 2 && rest[0] === 'vendor' && rest[1] === 'dashboard' && req.method === 'GET') {
        write(res, 200, envelope(port.getVendorDashboard(db, scope.companyId, user.id)));
        return true;
      }
      
      if (rest.length === 2 && rest[0] === 'vendor' && rest[1] === 'rfqs' && req.method === 'GET') {
        write(res, 200, envelope(port.listVendorRfqs(db, scope.companyId, user.id)));
        return true;
      }
      
      if (rest.length === 4 && rest[0] === 'vendor' && rest[1] === 'rfqs' && rest[3] === 'quote' && req.method === 'POST') {
        const rfqId = rest[2];
        body(req).then(input => {
          write(res, 200, envelope(port.submitVendorQuote(db, scope.companyId, user.id, rfqId, input.total_amount, input.lines)));
        }).catch(error => routeError(res, error));
        return true;
      }
      
      if (rest.length === 2 && rest[0] === 'vendor' && rest[1] === 'orders' && req.method === 'GET') {
        write(res, 200, envelope(port.listVendorOrders(db, scope.companyId, user.id)));
        return true;
      }
      
      if (rest.length === 4 && rest[0] === 'vendor' && rest[1] === 'orders' && rest[3] === 'confirm' && req.method === 'POST') {
        const orderId = rest[2];
        body(req).then(input => {
          write(res, 200, envelope(port.confirmVendorOrder(db, scope.companyId, user.id, orderId, input.action)));
        }).catch(error => routeError(res, error));
        return true;
      }
      
      if (rest.length === 2 && rest[0] === 'vendor' && rest[1] === 'bills' && req.method === 'GET') {
        write(res, 200, envelope(port.listVendorBills(db, scope.companyId, user.id)));
        return true;
      }
      
      write(res, 404, envelope(null, 'Portal endpoint not found', { code: 'PORTAL_ENDPOINT_NOT_FOUND' }));
      return true;
    } catch (error) { routeError(res, error); return true; }
  }
  return { handle };
}

module.exports = { mountPortalRoutes };
