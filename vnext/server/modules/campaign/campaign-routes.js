// R6.7 thin HTTP adapter for campaigns and omni-communication webhooks.
'use strict';

const camp = require('./campaign-engine');

const API_BASE = '/api/x/campaigns';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountCampaignRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission } = deps;
  if (!db) throw new Error('mountCampaignRoutes requires db');
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
    const resolved = typeof resolveScope === 'function' ? resolveScope(req, user ? { userId: user.id, groups: user.groups, user: { id: user.id } } : undefined) : { companyId: req.headers['x-company-id'] };
    if (resolved?.error) { write(res, resolved.error.status || 403, envelope(null, resolved.error.message, { code: resolved.error.code })); return null; }
    if (!resolved?.companyId) { write(res, 400, envelope(null, 'x-company-id is required', { code: 'COMPANY_SCOPE_REQUIRED' })); return null; }
    return { companyId: String(resolved.companyId), tenantId: String(resolved.tenantId || resolved.companyId) };
  }

  async function body(req) { const raw = await read(req); try { return raw ? JSON.parse(raw) : {}; } catch (_) { const error = new Error('Invalid JSON body'); error.statusCode = 400; error.code = 'INVALID_JSON'; throw error; } }
  function routeError(res, error) { write(res, error.statusCode || 400, envelope(null, error.message || 'Campaign request failed', { code: error.code || 'CAMPAIGN_ERROR' })); }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    
    // Check webhooks first (they do NOT require login session auth, they are public API hooks)
    const isWebhook = rest.length >= 1 && rest[0] === 'webhook';
    
    let user = null;
    if (!isWebhook) {
      let requiredPerm = 'campaign:view';
      if (req.method === 'POST') {
        requiredPerm = 'campaign:manage';
      }
      user = auth(req, res, requiredPerm);
      if (!user) return true;
    }
    
    const scope = company(req, res, user); if (!scope) return true;

    try {
      if (rest.length === 0) {
        if (req.method === 'GET') {
          write(res, 200, envelope(camp.listCampaigns(db, scope.companyId)));
          return true;
        }
        if (req.method === 'POST') {
          body(req).then(input => write(res, 201, envelope(camp.createCampaign(db, scope.companyId, input, user.id)))).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 2 && rest[0] === 'webhook' && req.method === 'POST') {
        const hookType = rest[1];
        if (hookType === 'dlr') {
          body(req).then(input => {
            write(res, 200, envelope(camp.receiveWebhookDlr(db, scope.companyId, input.message_id, input.status)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (hookType === 'inbound') {
          body(req).then(input => {
            write(res, 200, envelope(camp.receiveWebhookInbound(db, scope.companyId, input.from, input.body)));
          }).catch(error => routeError(res, error));
          return true;
        }
      }
      
      if (rest.length === 1) {
        const campaignId = rest[0];
        if (req.method === 'GET') {
          write(res, 200, envelope(camp.getCampaign(db, scope.companyId, campaignId)));
          return true;
        }
      }
      
      if (rest.length === 2) {
        const campaignId = rest[0];
        const action = rest[1];
        
        if (action === 'dispatch' && req.method === 'POST') {
          body(req).then(input => {
            write(res, 200, envelope(camp.dispatchCampaign(db, scope.companyId, campaignId, input.partner_ids, user.id)));
          }).catch(error => routeError(res, error));
          return true;
        }
        
        if (action === 'messages' && req.method === 'GET') {
          write(res, 200, envelope(camp.getMessageLogs(db, scope.companyId, campaignId)));
          return true;
        }
      }
      
      write(res, 404, envelope(null, 'Campaign endpoint not found', { code: 'CAMPAIGN_ENDPOINT_NOT_FOUND' }));
      return true;
    } catch (error) { routeError(res, error); return true; }
  }
  return { handle };
}

module.exports = { mountCampaignRoutes };
