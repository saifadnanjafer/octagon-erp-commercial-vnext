// R6.3 thin HTTP adapter for loyalty, gift cards, and eWallets.
'use strict';

const loy = require('./loyalty-engine');

const API_BASE = '/api/x/loyalty';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountLoyaltyRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission, events } = deps;
  if (!db) throw new Error('mountLoyaltyRoutes requires db');
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
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'Loyalty request failed', { code: error.code || 'LOYALTY_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    
    let requiredPerm = 'loyalty:view';
    if (req.method === 'POST') {
      requiredPerm = 'loyalty:manage';
    }
    
    const user = auth(req, res, requiredPerm);
    if (!user) return true;
    const scope = company(req, res, user); if (!scope) return true;

    try {
      if (rest.length === 1 && rest[0] === 'programs') {
        if (req.method === 'GET') {
          write(res, 200, envelope(loy.listPrograms(db, scope.companyId)));
          return true;
        }
        if (req.method === 'POST') {
          body(req).then(input => write(res, 201, envelope(loy.createProgram(db, scope.companyId, input, user.id)))).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 2 && rest[0] === 'programs' && req.method === 'GET') {
        write(res, 200, envelope(loy.getProgram(db, scope.companyId, rest[1])));
        return true;
      }
      
      if (rest.length === 1 && rest[0] === 'cards') {
        if (req.method === 'GET') {
          write(res, 200, envelope(loy.listCards(db, scope.companyId)));
          return true;
        }
        if (req.method === 'POST') {
          body(req).then(input => write(res, 201, envelope(loy.createCard(db, scope.companyId, input, user.id)))).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 2 && rest[0] === 'cards') {
        const cardId = rest[1];
        if (req.method === 'GET') {
          write(res, 200, envelope(loy.getCard(db, scope.companyId, cardId)));
          return true;
        }
      }
      
      if (rest.length === 3 && rest[0] === 'cards') {
        const cardId = rest[1];
        const action = rest[2];
        
        if (action === 'balance' && req.method === 'GET') {
          const asOf = url.searchParams.get('as_of') || undefined;
          write(res, 200, envelope(loy.getRedeemablePointsBalance(db, scope.companyId, cardId, asOf)));
          return true;
        }
        
        if (action === 'add-points' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(loy.addPoints(db, scope.companyId, cardId, input.points, input.reference_doc, input.expiry_date, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (action === 'redeem-points' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(loy.redeemPoints(db, scope.companyId, cardId, input.points, input.reference_doc, input.as_of, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (action === 'upgrade-tier' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(loy.evaluateAndUpgradeTier(db, scope.companyId, cardId, input.as_of)));
          }).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 1 && rest[0] === 'gift-cards') {
        if (req.method === 'GET') {
          write(res, 200, envelope(loy.listGiftCards(db, scope.companyId)));
          return true;
        }
        if (req.method === 'POST') {
          body(req).then(input => write(res, 201, envelope(loy.issueGiftCard(db, scope.companyId, input, user.id)))).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 2 && rest[0] === 'gift-cards') {
        const giftCardId = rest[1];
        if (req.method === 'GET') {
          write(res, 200, envelope(loy.getGiftCard(db, scope.companyId, giftCardId)));
          return true;
        }
      }
      
      if (rest.length === 3 && rest[0] === 'gift-cards') {
        const giftCardId = rest[1];
        const action = rest[2];
        
        if (action === 'redeem' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(loy.redeemGiftCard(db, scope.companyId, giftCardId, input.amount, input.reference_doc, input.as_of, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (action === 'load' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(loy.loadGiftCard(db, scope.companyId, giftCardId, input.amount, input.reference_doc, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 3 && rest[0] === 'ewallet') {
        const partnerId = rest[1];
        const action = rest[2];
        
        if (action === 'balance' && req.method === 'GET') {
          write(res, 200, envelope(loy.getEWalletBalance(db, scope.companyId, partnerId)));
          return true;
        }
        
        if (action === 'adjust' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(loy.adjustEWallet(db, scope.companyId, partnerId, input.amount, input.reference_doc, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
      }
      
      write(res, 404, envelope(null, 'Loyalty endpoint not found', { code: 'LOYALTY_NOT_FOUND' }));
      return true;
    } catch (error) { routeError(res, error); return true; }
  }
  return { handle };
}

module.exports = { mountLoyaltyRoutes };
