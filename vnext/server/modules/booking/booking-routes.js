// R6.5 thin HTTP adapter for appointments and resource booking.
'use strict';

const book = require('./booking-engine');

const API_BASE = '/api/x/booking';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountBookingRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission } = deps;
  if (!db) throw new Error('mountBookingRoutes requires db');
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
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'Booking request failed', { code: error.code || 'BOOKING_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    
    let requiredPerm = 'booking:view';
    if (req.method === 'POST') {
      requiredPerm = 'booking:manage';
    }
    
    const user = auth(req, res, requiredPerm);
    if (!user) return true;
    const scope = company(req, res, user); if (!scope) return true;

    try {
      if (rest.length === 1 && rest[0] === 'resources') {
        if (req.method === 'GET') {
          write(res, 200, envelope(book.listResources(db, scope.companyId)));
          return true;
        }
        if (req.method === 'POST') {
          body(req).then(input => write(res, 201, envelope(book.createResource(db, scope.companyId, input, user.id)))).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 2 && rest[0] === 'resources') {
        const resId = rest[1];
        if (req.method === 'GET') {
          write(res, 200, envelope(book.getResource(db, scope.companyId, resId)));
          return true;
        }
      }
      
      if (rest.length === 3 && rest[0] === 'resources' && rest[2] === 'slots') {
        const resId = rest[1];
        if (req.method === 'GET') {
          const date = url.searchParams.get('date') || undefined;
          write(res, 200, envelope(book.getAvailableSlots(db, scope.companyId, resId, date)));
          return true;
        }
      }
      
      if (rest.length === 1 && rest[0] === 'bookings') {
        if (req.method === 'GET') {
          const filters = {
            resource_id: url.searchParams.get('resource_id') || undefined,
            partner_id: url.searchParams.get('partner_id') || undefined,
            booking_date: url.searchParams.get('booking_date') || undefined
          };
          write(res, 200, envelope(book.listBookings(db, scope.companyId, filters)));
          return true;
        }
        if (req.method === 'POST') {
          body(req).then(input => write(res, 201, envelope(book.createBooking(db, scope.companyId, input, user.id)))).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 2 && rest[0] === 'bookings') {
        const bookingId = rest[1];
        if (req.method === 'GET') {
          write(res, 200, envelope(book.getBooking(db, scope.companyId, bookingId)));
          return true;
        }
      }
      
      if (rest.length === 3 && rest[0] === 'bookings' && rest[2] === 'state') {
        const bookingId = rest[1];
        if (req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(book.updateBookingState(db, scope.companyId, bookingId, input.state, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
      }
      
      write(res, 404, envelope(null, 'Booking endpoint not found', { code: 'BOOKING_ENDPOINT_NOT_FOUND' }));
      return true;
    } catch (error) { routeError(res, error); return true; }
  }
  return { handle };
}

module.exports = { mountBookingRoutes };
