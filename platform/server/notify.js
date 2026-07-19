// ============================================================================
// Octagon Commercial — In-site notifications (P0.5)
// Pattern from erp-research/ruoyi-vue-pro-master/yudao-module-system/**
// NotifyTemplate/NotifyMessage separation, re-expressed as a compact local
// x_notifications inbox. It composes the P0.5 Approval Center handler.
// ============================================================================
'use strict';

const crypto = require('crypto');
const { createApprovalHandler, ensureApprovalTables } = require('./approvals');

const API_BASE = '/api/x/notify';

function ensureNotifyTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_notifications (
      id TEXT PRIMARY KEY,
      user TEXT NOT NULL,
      title TEXT DEFAULT '',
      body TEXT DEFAULT '',
      link TEXT DEFAULT '',
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_x_notifications_user_read ON x_notifications(user, read, created_at);
  `);
}

function envelope(data, error, meta) { return { success: !error, data: error ? null : data, error: error || null, meta: meta || null }; }
function clean(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 4000); }
function messageId() { return `ntf_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`; }

function userFromRequest(req, deps) {
  try {
    const active = deps.authSessionFromRequest && deps.authSessionFromRequest(req);
    const session = active && (active.session || active);
    if (session && (session.userId || session.id || session.user)) return clean(session.userId || session.id || session.user, 120);
  } catch (_) { /* header/local fallback for harness and local developer mode */ }
  return clean((req.headers || {})['x-user'] || 'local', 120) || 'local';
}

function rowToNotification(row) {
  return { id: row.id, user: row.user, title: row.title, body: row.body, link: row.link, read: Number(row.read) ? 1 : 0, created_at: row.created_at };
}

function send(db, input) {
  const user = clean(input.user, 120);
  if (!user) return { status: 400, json: envelope(null, 'user is required') };
  const item = { id: messageId(), user, title: clean(input.title, 240), body: clean(input.body, 4000), link: clean(input.link, 800), read: 0, created_at: new Date().toISOString() };
  db.prepare('INSERT INTO x_notifications (id, user, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .run(item.id, item.user, item.title, item.body, item.link, item.created_at);
  return { status: 201, json: envelope(item) };
}

function list(db, user, query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const unreadOnly = String(query.unread || '') === '1';
  const where = unreadOnly ? 'user = ? AND read = 0' : 'user = ?';
  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM x_notifications WHERE ${where}`).get(user).n || 0);
  const unread = Number(db.prepare('SELECT COUNT(*) AS n FROM x_notifications WHERE user = ? AND read = 0').get(user).n || 0);
  const items = db.prepare(`SELECT * FROM x_notifications WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(user, limit, (page - 1) * limit).map(rowToNotification);
  return { status: 200, json: envelope(items, null, { total, unread, page, limit }) };
}

function markRead(db, user, id, read) {
  const result = db.prepare('UPDATE x_notifications SET read = ? WHERE id = ? AND user = ?').run(read ? 1 : 0, clean(id, 180), user);
  if (!Number(result.changes)) return { status: 404, json: envelope(null, 'notification not found') };
  return { status: 200, json: envelope({ id: clean(id, 180), read: read ? 1 : 0 }) };
}

function dispatch(db, method, pathname, query, body, user) {
  const rest = pathname.slice(API_BASE.length).replace(/^\/+|\/+$/g, '');
  const parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 1 && parts[0] === 'list' && method === 'GET') return list(db, user, query || {});
  if (parts.length === 1 && parts[0] === 'send' && method === 'POST') return send(db, body || {});
  if (parts.length === 2 && parts[0] === 'mark-read' && method === 'POST') return markRead(db, user, parts[1], true);
  return { status: 404, json: envelope(null, 'notification route not found') };
}

function mountNotify(deps) {
  const db = deps && deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') throw new Error('mountNotify requires sqlite db');
  ensureNotifyTables(db);
  ensureApprovalTables(db);
  const approvalHandler = createApprovalHandler(deps);
  const notifyRequester = input => send(db, input);
  return {
    handle(req, res, requestUrl) {
      const url = requestUrl || new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/x/approvals/')) return approvalHandler.handle(req, res, url, notifyRequester);
      if (!url.pathname.startsWith(API_BASE + '/')) return false;
      const respond = result => { const text = JSON.stringify(result.json); res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) }); res.end(text); };
      const run = body => { try { respond(dispatch(db, req.method, url.pathname, Object.fromEntries(url.searchParams), body, userFromRequest(req, deps))); } catch (error) { respond({ status: 500, json: envelope(null, error.message || 'notification failed') }); } };
      if (req.method === 'GET') { run(null); return true; }
      let raw = '';
      req.on('data', part => { raw += part; if (raw.length > 1024 * 1024) req.destroy(); });
      req.on('end', () => { if (!raw) return run({}); try { const body = JSON.parse(raw); if (!body || typeof body !== 'object') throw new Error('invalid'); run(body); } catch (_) { respond({ status: 400, json: envelope(null, 'Invalid JSON body') }); } });
      return true;
    },
    send: input => send(db, input),
  };
}

function mountNotifyExpress(app, db, deps) {
  const handler = mountNotify({ ...(deps || {}), db });
  app.use((req, res, next) => { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); if (!handler.handle(req, res, url)) next(); });
  return app;
}

module.exports = { ensureNotifyTables, mountNotify, mountNotifyExpress, send, _internal: { dispatch, list, markRead } };
