// clean-room; behavior modeled on platform/server/notify.js (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createApprovalHandler } = require('../approvals/approvals');

const API_BASE = '/api/x/notify';
const OUTBOUND_EMAIL_LOG = path.resolve(__dirname, '../../../vnext-data/outbound-emails.log');
const OUTBOUND_WHATSAPP_LOG = path.resolve(__dirname, '../../../vnext-data/outbound-whatsapp.log');

function envelope(data, error, meta) { return { success: !error, data: error ? null : data, error: error || null, meta: meta || null }; }
function clean(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 4000); }
function messageId() { return `ntf_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`; }

function userFromRequest(req, deps) {
  try {
    const active = deps.authSessionFromRequest && deps.authSessionFromRequest(req);
    const session = active && (active.session || active);
    if (session && (session.userId || session.id || session.user)) return clean(session.userId || session.id || session.user, 120);
  } catch (_) {}
  return clean((req.headers || {})['x-user'] || 'local', 120) || 'local';
}

function rowToNotification(row) {
  return { id: row.id, user: row.user, title: row.title, body: row.body, link: row.link, read: Number(row.read) ? 1 : 0, created_at: row.created_at };
}

// Outgoing notification channel adapters
const emailAdapter = {
  send(user, title, body, link) {
    const logLine = JSON.stringify({ at: new Date().toISOString(), user, title, body, link }) + '\n';
    try {
      fs.mkdirSync(path.dirname(OUTBOUND_EMAIL_LOG), { recursive: true });
      fs.appendFileSync(OUTBOUND_EMAIL_LOG, logLine);
    } catch (_) {}
    console.log(`[SMTP email] Sent email to user [${user}]: ${title} - ${body}`);
  }
};

const whatsappAdapter = {
  send(user, title, body, link) {
    const logLine = JSON.stringify({ at: new Date().toISOString(), user, title, body, link }) + '\n';
    try {
      fs.mkdirSync(path.dirname(OUTBOUND_WHATSAPP_LOG), { recursive: true });
      fs.appendFileSync(OUTBOUND_WHATSAPP_LOG, logLine);
    } catch (_) {}
    console.log(`[WhatsApp API] Sent message to user [${user}]: ${title} - ${body}`);
  }
};

function send(db, input, eventBus) {
  const user = clean(input.user, 120);
  if (!user) return { status: 400, json: envelope(null, 'user is required') };
  const title = clean(input.title, 240);
  const body = clean(input.body, 4000);
  const link = clean(input.link, 800);

  // Retrieve user channel preferences. x_notification_preferences is created
  // by migrations/302_r1_lane_c_completion.mjs; the try/catch below is only a
  // defensive fallback (e.g. a script that queries this module before the
  // migration runner has run), not a substitute for the migration.
  let channels = ['in-app'];
  try {
    const prefRow = db.prepare('SELECT channels FROM x_notification_preferences WHERE user = ?').get(user);
    if (prefRow && prefRow.channels) {
      channels = String(prefRow.channels).split(',').map(c => c.trim()).filter(Boolean);
    }
  } catch (_) {
    // If table doesn't exist, default to in-app
  }

  const item = { id: messageId(), user, title, body, link, read: 0, created_at: new Date().toISOString() };

  if (channels.includes('in-app')) {
    db.prepare('INSERT INTO x_notifications (id, user, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
      .run(item.id, item.user, item.title, item.body, item.link, item.created_at);
  }
  if (channels.includes('email')) {
    emailAdapter.send(user, title, body, link);
  }
  if (channels.includes('whatsapp')) {
    whatsappAdapter.send(user, title, body, link);
  }

  if (eventBus && typeof eventBus.publish === 'function') {
    try {
      eventBus.publish({
        type: 'notification.created', companyId: input.companyId || null, userId: user,
        audience: { kind: 'user' }, entity: 'notification', recordId: item.id,
        requiredPermission: 'platform:notification:read',
        payload: { id: item.id, title: item.title, link: item.link }, createdBy: input.createdBy || null,
      });
    } catch (_) {}
  }

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

function updatePreferences(db, user, body) {
  const channels = Array.isArray(body.channels) ? body.channels.join(',') : 'in-app';
  db.prepare(`
    INSERT INTO x_notification_preferences (user, channels) VALUES (?, ?)
    ON CONFLICT(user) DO UPDATE SET channels = excluded.channels
  `).run(user, channels);
  return { status: 200, json: envelope({ user, channels: channels.split(',') }) };
}

function dispatch(db, method, pathname, query, body, user, eventBus) {
  const rest = pathname.slice(API_BASE.length).replace(/^\/+|\/+$/g, '');
  const parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 1 && parts[0] === 'list' && method === 'GET') return list(db, user, query || {});
  if (parts.length === 1 && parts[0] === 'send' && method === 'POST') return send(db, body || {}, eventBus);
  if (parts.length === 2 && parts[0] === 'mark-read' && method === 'POST') return markRead(db, user, parts[1], true);
  if (parts.length === 1 && parts[0] === 'preferences' && method === 'PUT') return updatePreferences(db, user, body || {});
  return { status: 404, json: envelope(null, 'notification route not found') };
}

function mountNotify(deps) {
  const db = deps && deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') throw new Error('mountNotify requires sqlite db');

  // T1.8.1 migration-hygiene fix: x_notification_preferences used to be
  // created here at runtime via `CREATE TABLE IF NOT EXISTS`, violating the
  // project guardrail "all schema via migrations/NNN_*.mjs — no
  // engine-created tables" (R1_FINAL_COMPLETION_REPORT.md §2.2). The table is
  // now owned by migrations/302_r1_lane_c_completion.mjs, which the app
  // already runs on boot before any route mounts (server.js). No table
  // creation happens here anymore.

  const approvalHandler = createApprovalHandler(deps);
  return {
    handle(req, res, requestUrl) {
      const url = requestUrl || new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/x/approvals/')) return approvalHandler.handle(req, res, url, input => send(db, input, deps.events));
      if (!url.pathname.startsWith(API_BASE + '/')) return false;
      const respond = result => { const text = JSON.stringify(result.json); res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) }); res.end(text); };
      const run = body => { try { respond(dispatch(db, req.method, url.pathname, Object.fromEntries(url.searchParams), body, userFromRequest(req, deps), deps.events)); } catch (error) { respond({ status: 500, json: envelope(null, error.message || 'notification failed') }); } };
      if (req.method === 'GET') { run(null); return true; }
      let raw = '';
      req.on('data', part => { raw += part; if (raw.length > 1024 * 1024) req.destroy(); });
      req.on('end', () => { if (!raw) return run({}); try { const body = JSON.parse(raw); if (!body || typeof body !== 'object') throw new Error('invalid'); run(body); } catch (_) { respond({ status: 400, json: envelope(null, 'Invalid JSON body') }); } });
      return true;
    },
    send: input => send(db, input, deps.events),
  };
}

module.exports = { mountNotify, send, _internal: { dispatch, list, markRead, emailAdapter, whatsappAdapter } };
