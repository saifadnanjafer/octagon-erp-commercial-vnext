// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const arap = require('./arap-engine');
const bank = require('./bank-engine');
const reports = require('./report-engine');
const localization = require('../localization/localization-engine');

function envelope(data, error = null) { return { success: !error, data: error ? null : data, error: error || null }; }
function mountR2FinanceRoutes(deps = {}) {
  const db = deps.db;
  const sendJson = deps.sendJson || ((res, status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); });
  const readBody = deps.readRequestBody || ((req) => new Promise((resolve, reject) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks).toString())); req.on('error', reject); }));
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };
  function user(req, res) {
    if (typeof deps.requireSession === 'function') {
      const s = deps.requireSession(req, inert);
      if (!s || !s.ok) { sendJson(res, 401, envelope(null, 'Login session required')); return null; }
      const current = { id: String(s.userId), role: String(s.user?.role || ''), groups: s.groups || s.user?.groups || [] };
      req._r2Session = { userId: current.id, user: s.user, groups: current.groups };
      return current;
    }
    return { id: String(req.headers?.['x-octagon-user'] || ''), role: String(req.headers?.['x-octagon-role'] || ''), groups: [] };
  }
  function auth(req, res, permission) {
    const current = user(req, res); if (!current) return null;
    if (typeof deps.canPermission === 'function' && !deps.canPermission(current, permission)) { sendJson(res, 403, envelope(null, `Permission required: ${permission}`)); return null; }
    return current;
  }
  function scope(req, res, requested) {
    const companyId = String(requested || '').trim();
    if (!companyId) { const error = new Error('company_id is required'); error.statusCode = 400; throw error; }
    if (typeof deps.resolveScope === 'function') {
      const resolved = deps.resolveScope(req, req._r2Session || { userId: '' });
      if (resolved && resolved.error) { const error = new Error(resolved.error.message); error.statusCode = resolved.error.status || 403; throw error; }
      if (resolved && resolved.companyId && resolved.companyId !== companyId) { const error = new Error('company scope denied'); error.statusCode = 403; throw error; }
    }
    return companyId;
  }
  function bodyRoute(req, res, fn) { readBody(req).then(raw => { let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return sendJson(res, 400, envelope(null, 'Invalid JSON')); } try { const result = fn(body); sendJson(res, 200, envelope(result)); } catch (e) { sendJson(res, e.statusCode || (e.message?.includes('locked') ? 409 : 400), envelope(null, e.message)); } }).catch(e => sendJson(res, 500, envelope(null, e.message))); }
  function routeError(res, e) { sendJson(res, e.statusCode || 400, envelope(null, e.message)); }

  function handle(req, res, requestUrl) {
    const path = requestUrl.pathname;
    try {
      if (path.startsWith('/api/x/arap')) {
        const rest = path.slice('/api/x/arap'.length).split('/').filter(Boolean).map(decodeURIComponent);
        if (req.method === 'POST' && rest[0] === 'partners') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => arap.createPartner(db, scope(req, res, b.company_id), b, u.id)) || true; }
        if (req.method === 'POST' && rest[0] === 'products') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => arap.createProduct(db, scope(req, res, b.company_id), b, u.id)) || true; }
        if (req.method === 'POST' && rest.length === 1 && rest[0] === 'documents') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => arap.createArapDocument(db, scope(req, res, b.company_id), b, u.id)) || true; }
        if (req.method === 'POST' && rest[0] === 'documents' && rest[1] && rest[2] === 'post') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; const result = arap.postArapDocument(db, rest[1], u.id); sendJson(res, 200, envelope(result)); return true; }
        if (req.method === 'GET' && rest[0] === 'documents') { const u = auth(req, res, 'finance:gl:view'); if (!u) return true; const companyId = scope(req, res, requestUrl.searchParams.get('company_id')); if (!companyId) return true; sendJson(res, 200, envelope(arap.listArap(db, companyId, requestUrl.searchParams.get('document_kind'), requestUrl.searchParams.get('partner_id')))); return true; }
        if (req.method === 'POST' && rest.length === 1 && rest[0] === 'payments') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => arap.createPayment(db, scope(req, res, b.company_id), b, u.id)) || true; }
        if (req.method === 'POST' && rest[0] === 'payments' && rest[1] && rest[2] === 'reverse') { const u = auth(req, res, 'finance:gl:reverse'); if (!u) return true; try { sendJson(res, 200, envelope(arap.reversePayment(db, rest[1], u.id))); } catch (e) { routeError(res, e); } return true; }
        if (req.method === 'GET' && rest[0] === 'payments') { const u = auth(req, res, 'finance:gl:view'); if (!u) return true; const companyId = scope(req, res, requestUrl.searchParams.get('company_id')); if (!companyId) return true; sendJson(res, 200, envelope(db.prepare('SELECT * FROM payment WHERE company_id=? ORDER BY payment_date,id').all(companyId))); return true; }
      }
      if (path.startsWith('/api/x/bank')) {
        const rest = path.slice('/api/x/bank'.length).split('/').filter(Boolean).map(decodeURIComponent);
        if (req.method === 'POST' && rest[0] === 'accounts') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => bank.createBankAccount(db, scope(req, res, b.company_id), b, u.id)) || true; }
        if (req.method === 'POST' && rest[0] === 'match-rules') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => bank.createMatchRule(db, scope(req, res, b.company_id), b, u.id)) || true; }
        if (req.method === 'GET' && rest[0] === 'match-rules') { const u = auth(req, res, 'finance:gl:view'); if (!u) return true; const companyId = scope(req, res, requestUrl.searchParams.get('company_id')); if (!companyId) return true; sendJson(res, 200, envelope(bank.listMatchRules(db, companyId))); return true; }
        if (req.method === 'POST' && rest[0] === 'statements/import') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => bank.importStatement(db, scope(req, res, b.company_id), b, u.id)) || true; }
        if (req.method === 'POST' && rest[0] === 'lines' && rest[1] && rest[2] === 'match') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => bank.matchBankLine(db, scope(req, res, b.company_id), rest[1], b, u.id)) || true; }
        if (req.method === 'POST' && rest[0] === 'lines' && rest[1] && rest[2] === 'reconcile') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => bank.manualReconcile(db, scope(req, res, b.company_id), rest[1], b, u.id)) || true; }
        if (req.method === 'POST' && rest[0] === 'lines' && rest[1] && rest[2] === 'difference') { const u = auth(req, res, 'finance:gl:post'); if (!u) return true; return bodyRoute(req, res, b => bank.recordBankDifference(db, scope(req, res, b.company_id), rest[1], b, u.id)) || true; }
        if (req.method === 'POST' && rest[0] === 'reconciliations' && rest[1] && rest[2] === 'reverse') { const u = auth(req, res, 'finance:gl:reverse'); if (!u) return true; return bodyRoute(req, res, b => bank.unreconcile(db, scope(req, res, b.company_id), rest[1], u.id)) || true; }
      }
      if (path.startsWith('/api/x/reports/')) {
        const u = auth(req, res, 'finance:gl:view'); if (!u) return true;
        const type = decodeURIComponent(path.slice('/api/x/reports/'.length)); const companyId = scope(req, res, requestUrl.searchParams.get('company_id')); if (!companyId) return true;
        const options = Object.fromEntries(requestUrl.searchParams.entries());
        const result = reports.report(db, companyId, type, options);
        if (requestUrl.searchParams.get('format') === 'csv') { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${type}.csv"` }); res.end(reports.csv(result)); } else sendJson(res, 200, envelope(result));
        return true;
      }
      if (path.startsWith('/api/x/localization')) {
        const rest = path.slice('/api/x/localization'.length).split('/').filter(Boolean).map(decodeURIComponent);
        if (req.method === 'GET' && rest[0] === 'packs') { const u = auth(req, res, 'system:admin'); if (!u) return true; sendJson(res, 200, envelope(localization.listPacks(db))); return true; }
        if (req.method === 'GET' && rest[0] === 'company') { const u = auth(req, res, 'finance:gl:view'); if (!u) return true; const companyId = scope(req, res, requestUrl.searchParams.get('company_id')); if (!companyId) return true; sendJson(res, 200, envelope(localization.getCompanyLocalization(db, companyId))); return true; }
        if (req.method === 'POST' && rest[0] === 'packs' && rest[1] && (rest[2] === 'install' || rest[2] === 'uninstall')) { const u = auth(req, res, 'system:admin'); if (!u) return true; return bodyRoute(req, res, b => { const companyId = scope(req, res, b.company_id); return rest[2] === 'install' ? localization.installPack(db, companyId, rest[1], u.id) : localization.uninstallPack(db, companyId, rest[1], u.id); }) || true; }
      }
      return false;
    } catch (e) { routeError(res, e); return true; }
  }
  return { handle };
}

module.exports = { mountR2FinanceRoutes };
