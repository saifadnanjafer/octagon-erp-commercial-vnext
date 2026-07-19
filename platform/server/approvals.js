// ============================================================================
// Octagon Commercial — Approval Center (P0.5)
// Pattern from erp-research/ruoyi-vue-pro-master/yudao-module-bpm/**:
// Approval Center boxes (todo/mine/done/cc), explicit decision history and
// requester notification, re-expressed for Node HTTP + SQLite.
// Existing server-jarvis-security.js approval records are read-only reference;
// this module owns only x_approvals and never executes the requested action.
// ============================================================================
'use strict';

const crypto = require('crypto');

const API_BASE = '/api/x/approvals';
const BOXES = new Set(['todo', 'mine', 'done', 'cc']);
const STATUSES = new Set(['pending', 'approved', 'rejected']);

function ensureApprovalTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_approvals (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      requester TEXT NOT NULL,
      approver_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      decided_by TEXT DEFAULT '',
      decided_at TEXT DEFAULT '',
      cc TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_x_approvals_status_role ON x_approvals(status, approver_role);
    CREATE INDEX IF NOT EXISTS idx_x_approvals_requester ON x_approvals(requester, created_at);
  `);
}

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

function parseJson(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 4000);
}

function approvalId() {
  return `apr_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function normalizeCc(value) {
  const source = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
  return [...new Set(source.map(item => clean(item, 120)).filter(Boolean))].slice(0, 50);
}

function rowToApproval(row) {
  return {
    id: row.id,
    entity: row.entity,
    record_id: row.record_id,
    action: row.action,
    payload: parseJson(row.payload, {}),
    requester: row.requester,
    approver_role: row.approver_role,
    status: row.status,
    decided_by: row.decided_by || '',
    decided_at: row.decided_at || '',
    cc: normalizeCc(parseJson(row.cc, [])),
    created_at: row.created_at,
  };
}

function userContext(req, deps) {
  let session = null;
  try {
    const active = deps.authSessionFromRequest && deps.authSessionFromRequest(req);
    session = active && (active.session || active);
  } catch (_) { /* preserve local test support */ }
  const header = req.headers || {};
  const user = clean((session && (session.userId || session.id || session.user)) || header['x-user'] || 'local', 120);
  const rawRoles = (session && (session.roles || session.groups || session.role)) || header['x-roles'] || header['x-role'] || '';
  const roles = Array.isArray(rawRoles) ? rawRoles : String(rawRoles).split(',');
  return { user: user || 'local', roles: roles.map(role => clean(role, 120)).filter(Boolean) };
}

function userCanApprove(ctx, role) {
  // The live server's local-dev session is intentionally treated as admin,
  // matching the existing Jarvis security gate. Production must supply a role.
  return ctx.user === 'local' || ctx.roles.includes('admin') || ctx.roles.includes('all') || ctx.roles.includes(role);
}

function createApproval(db, input, requester) {
  const entity = clean(input.entity, 120);
  const recordId = clean(input.record_id || input.recordId, 160);
  const action = clean(input.action, 120);
  const approverRole = clean(input.approver_role || input.approverRole, 120);
  if (!entity || !recordId || !action || !approverRole) {
    return { status: 400, json: envelope(null, 'entity, record_id, action and approver_role are required') };
  }
  const item = {
    id: approvalId(), entity, record_id: recordId, action,
    payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
    requester, approver_role: approverRole, status: 'pending',
    decided_by: '', decided_at: '', cc: normalizeCc(input.cc), created_at: new Date().toISOString(),
  };
  db.prepare(`INSERT INTO x_approvals
    (id, entity, record_id, action, payload, requester, approver_role, status, decided_by, decided_at, cc, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(item.id, item.entity, item.record_id, item.action, JSON.stringify(item.payload), item.requester,
      item.approver_role, item.status, '', '', JSON.stringify(item.cc), item.created_at);
  return { status: 201, json: envelope(item) };
}

function listApprovals(db, query, context) {
  const box = BOXES.has(query.box) ? query.box : 'todo';
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  let where;
  let params;
  if (box === 'todo') {
    if (!context.roles.length && context.user !== 'local') return { status: 403, json: envelope(null, 'approver role is required') };
    where = "status = 'pending' AND (approver_role IN (" + (context.roles.length ? context.roles.map(() => '?').join(',') : "'__local__'") + ") OR ? = 'local')";
    params = [...context.roles, context.user];
  } else if (box === 'mine') {
    where = 'requester = ?'; params = [context.user];
  } else if (box === 'done') {
    where = "status IN ('approved', 'rejected') AND (decided_by = ? OR requester = ?)"; params = [context.user, context.user];
  } else {
    where = "cc LIKE ?"; params = ['%"' + context.user.replace(/[%_]/g, '') + '"%'];
  }
  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM x_approvals WHERE ${where}`).get(...params).n || 0);
  const rows = db.prepare(`SELECT * FROM x_approvals WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit).map(rowToApproval);
  return { status: 200, json: envelope(rows, null, { total, page, limit, box }) };
}

function decideApproval(db, id, decision, context, notifyRequester) {
  const row = db.prepare('SELECT * FROM x_approvals WHERE id = ?').get(clean(id, 180));
  if (!row) return { status: 404, json: envelope(null, 'approval not found') };
  const item = rowToApproval(row);
  if (item.status !== 'pending') return { status: 409, json: envelope(null, `approval is already ${item.status}`) };
  if (!userCanApprove(context, item.approver_role)) return { status: 403, json: envelope(null, 'approval role is required') };
  const status = decision === 'reject' ? 'rejected' : 'approved';
  const decidedAt = new Date().toISOString();
  db.prepare('UPDATE x_approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
    .run(status, context.user, decidedAt, item.id);
  const result = { ...item, status, decided_by: context.user, decided_at: decidedAt };
  if (typeof notifyRequester === 'function') {
    notifyRequester({
      user: result.requester,
      title: status === 'approved' ? 'تمت الموافقة على الطلب' : 'تم رفض طلب الموافقة',
      body: `${result.action} — ${result.entity}`,
      link: `#${result.entity}/${result.record_id}`,
    });
  }
  return { status: 200, json: envelope(result) };
}

function dispatch(db, method, pathname, query, body, context, notifyRequester) {
  const rest = pathname.slice(API_BASE.length).replace(/^\/+|\/+$/g, '');
  const parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 1 && parts[0] === 'request' && method === 'POST') return createApproval(db, body || {}, context.user);
  if (parts.length === 1 && parts[0] === 'list' && method === 'GET') return listApprovals(db, query || {}, context);
  if (parts.length === 2 && (parts[0] === 'approve' || parts[0] === 'reject') && method === 'POST') {
    return decideApproval(db, parts[1], parts[0] === 'reject' ? 'reject' : 'approve', context, notifyRequester);
  }
  return { status: 404, json: envelope(null, 'approval route not found') };
}

function createApprovalHandler(deps) {
  const db = deps && deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') throw new Error('createApprovalHandler requires sqlite db');
  ensureApprovalTables(db);
  return {
    handle(req, res, url, notifyRequester) {
      if (!url.pathname.startsWith(API_BASE + '/')) return false;
      const respond = result => {
        const text = JSON.stringify(result.json);
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
      };
      const run = body => {
        try { respond(dispatch(db, req.method, url.pathname, Object.fromEntries(url.searchParams), body, userContext(req, deps), notifyRequester)); }
        catch (error) { respond({ status: 500, json: envelope(null, error.message || 'approval failed') }); }
      };
      if (req.method === 'GET') { run(null); return true; }
      let raw = '';
      req.on('data', part => { raw += part; if (raw.length > 1024 * 1024) req.destroy(); });
      req.on('end', () => { if (!raw) return run({}); const body = parseJson(raw, null); if (!body || typeof body !== 'object') return respond({ status: 400, json: envelope(null, 'Invalid JSON body') }); run(body); });
      return true;
    },
  };
}

function mountApprovals(app, db, deps) {
  const handler = createApprovalHandler({ ...(deps || {}), db });
  app.use((req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (!handler.handle(req, res, url, deps && deps.notifyRequester)) next();
  });
  return app;
}

module.exports = { ensureApprovalTables, createApprovalHandler, mountApprovals, _internal: { dispatch, createApproval, listApprovals, decideApproval } };
