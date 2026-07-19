// ============================================================================
// Octagon Commercial — Platform Chatter (P0.3)
// Record message thread + activities + followers + follower notifications.
//
// Concept ported from:
//   - aureuserp-master/plugins/webkul/chatter/src/Traits/HasChatter.php
//     (messages()/activities()/followers()/addMessage()/addActivity(),
//      kind split message|log|activity via the `type` column)
//   - aureuserp-master/plugins/webkul/chatter/src/Models/{Message,Follower}.php
//   - odoo-19.0/addons/mail/models/mail_activity.py (activity types +
//     due-date + mark-done semantics: a done activity stays in the thread
//     as a completed entry instead of being deleted)
//
// Storage: SQLite via the server's node:sqlite DatabaseSync handle (also
// compatible with better-sqlite3 — both expose prepare().run/get/all + exec).
// Tables per BUILD_PACKETS.md §3: x_chatter, x_followers (+ defensive
// x_notifications per P0.5 schema so follower fan-out works before P0.5 lands).
//
// Exports:
//   mountChatter(app, db)        — Express-style route registration
//   createChatterHandler(db)     — plain-http adapter: { handle(req,res,url) }
//   logChange(db, entity, id, author, summary [, meta]) — crud-engine hook
//   ensureChatterTables(db)      — idempotent DDL (called by both mounts)
// ============================================================================

'use strict';

const crypto = require('crypto');

const API_BASE = '/api/x/chatter';
const VALID_KINDS = ['message', 'log', 'activity'];
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const MAX_BODY_CHARS = 20000;

// ---------------------------------------------------------------------------
// Schema (idempotent). Matches build-book §3 exactly.
// ---------------------------------------------------------------------------
function ensureChatterTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_chatter (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      record_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'message',
      body TEXT DEFAULT '',
      author TEXT DEFAULT '',
      activity_type TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      done INTEGER DEFAULT 0,
      meta TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_x_chatter_entity_record
      ON x_chatter(entity, record_id);
    CREATE INDEX IF NOT EXISTS idx_x_chatter_created
      ON x_chatter(created_at);
    CREATE TABLE IF NOT EXISTS x_followers (
      entity TEXT NOT NULL,
      record_id TEXT NOT NULL,
      user TEXT NOT NULL,
      PRIMARY KEY (entity, record_id, user)
    );
    -- Defensive: owned by P0.5 (notify.js); created here too so follower
    -- notification fan-out never crashes if chatter mounts first.
    CREATE TABLE IF NOT EXISTS x_notifications (
      id TEXT PRIMARY KEY,
      user TEXT NOT NULL,
      title TEXT DEFAULT '',
      body TEXT DEFAULT '',
      link TEXT DEFAULT '',
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_x_notifications_user
      ON x_notifications(user, read);
  `);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || undefined };
}

function safeJsonParse(text, fallback) {
  if (typeof text !== 'string' || !text) return fallback;
  try { return JSON.parse(text); } catch (_) { return fallback; }
}

function cleanText(value, maxLen) {
  return String(value == null ? '' : value).slice(0, maxLen || MAX_BODY_CHARS).trim();
}

function rowToItem(row) {
  return {
    id: row.id,
    entity: row.entity,
    record_id: row.record_id,
    kind: row.kind,
    body: row.body,
    author: row.author,
    activity_type: row.activity_type,
    due_date: row.due_date,
    done: Number(row.done) ? 1 : 0,
    meta: safeJsonParse(row.meta, {}),
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Core operations (framework-agnostic)
// ---------------------------------------------------------------------------

function listThread(db, entity, recordId, query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT));
  const kind = VALID_KINDS.includes(query.kind) ? query.kind : null;

  const where = kind
    ? 'WHERE entity = ? AND record_id = ? AND kind = ?'
    : 'WHERE entity = ? AND record_id = ?';
  const args = kind ? [entity, recordId, kind] : [entity, recordId];

  const total = db.prepare(`SELECT COUNT(*) AS n FROM x_chatter ${where}`).get(...args).n;
  const rows = db.prepare(
    `SELECT * FROM x_chatter ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, (page - 1) * limit);

  const followers = db.prepare(
    'SELECT user FROM x_followers WHERE entity = ? AND record_id = ? ORDER BY user'
  ).all(entity, recordId).map(r => r.user);

  const counts = { message: 0, log: 0, activity: 0, open_activities: 0 };
  db.prepare(
    `SELECT kind, done, COUNT(*) AS n FROM x_chatter
     WHERE entity = ? AND record_id = ? GROUP BY kind, done`
  ).all(entity, recordId).forEach(r => {
    if (counts[r.kind] != null) counts[r.kind] += r.n;
    if (r.kind === 'activity' && !Number(r.done)) counts.open_activities += r.n;
  });

  const asUser = cleanText(query.user, 120);
  return envelope({
    items: rows.map(rowToItem),
    followers,
    following: asUser ? followers.includes(asUser) : false,
    counts,
  }, null, { total, page, limit });
}

function postChatterItem(db, entity, recordId, payload) {
  const kind = VALID_KINDS.includes(payload.kind) ? payload.kind : 'message';
  const body = cleanText(payload.body);
  const activityType = cleanText(payload.activity_type, 120);
  const dueDate = cleanText(payload.due_date, 40);
  const author = cleanText(payload.author, 120) || 'system';

  if (kind !== 'activity' && !body) {
    return { status: 400, json: envelope(null, 'body is required for message/log') };
  }
  if (kind === 'activity' && !activityType && !body) {
    return { status: 400, json: envelope(null, 'activity requires activity_type or body') };
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}/.test(dueDate)) {
    return { status: 400, json: envelope(null, 'due_date must be YYYY-MM-DD') };
  }

  const item = {
    id: newId('ch'),
    entity,
    record_id: recordId,
    kind,
    body,
    author,
    activity_type: kind === 'activity' ? activityType : '',
    due_date: kind === 'activity' ? dueDate : '',
    done: 0,
    meta: JSON.stringify(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
    created_at: nowIso(),
  };

  db.prepare(
    `INSERT INTO x_chatter (id, entity, record_id, kind, body, author, activity_type, due_date, done, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(item.id, item.entity, item.record_id, item.kind, item.body, item.author,
        item.activity_type, item.due_date, item.done, item.meta, item.created_at);

  // Author of a message automatically follows the record (HasChatter:
  // addDefaultChatterFollowers concept). Logs stay silent on purpose.
  if (kind === 'message' && author !== 'system') {
    addFollower(db, entity, recordId, author);
  }

  notifyFollowers(db, item);
  item.meta = safeJsonParse(item.meta, {});
  return { status: 201, json: envelope(item) };
}

// Fan out one x_notifications row per follower (author excluded) — the
// ChatterNotificationService.notifyFollowers concept from AureusERP.
function notifyFollowers(db, item) {
  try {
    const followers = db.prepare(
      'SELECT user FROM x_followers WHERE entity = ? AND record_id = ?'
    ).all(item.entity, item.record_id).map(r => r.user);

    const kindLabel = { message: 'رسالة جديدة', log: 'تحديث سجل', activity: 'نشاط مجدول' }[item.kind] || 'تحديث';
    const summary = (item.body || item.activity_type || '').slice(0, 180);
    const insert = db.prepare(
      `INSERT INTO x_notifications (id, user, title, body, link, read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    );
    followers
      .filter(user => user && user !== item.author)
      .forEach(user => insert.run(
        newId('ntf'), user,
        `${kindLabel} — ${item.entity}`,
        `${item.author}: ${summary}`,
        `#${item.entity}/${item.record_id}`,
        nowIso()
      ));
  } catch (error) {
    // Notification fan-out must never break the write itself.
    console.warn('[chatter] notifyFollowers failed:', error.message);
  }
}

function setActivityDone(db, chatterId, done) {
  const row = db.prepare('SELECT * FROM x_chatter WHERE id = ?').get(chatterId);
  if (!row) return { status: 404, json: envelope(null, 'chatter item not found') };
  if (row.kind !== 'activity') {
    return { status: 400, json: envelope(null, 'only activity items can be marked done') };
  }
  const flag = done ? 1 : 0;
  const meta = safeJsonParse(row.meta, {});
  if (flag) meta.done_at = nowIso(); else delete meta.done_at;
  db.prepare('UPDATE x_chatter SET done = ?, meta = ? WHERE id = ?')
    .run(flag, JSON.stringify(meta), chatterId);
  const fresh = rowToItem(db.prepare('SELECT * FROM x_chatter WHERE id = ?').get(chatterId));
  return { status: 200, json: envelope(fresh) };
}

function addFollower(db, entity, recordId, user) {
  db.prepare(
    'INSERT OR IGNORE INTO x_followers (entity, record_id, user) VALUES (?, ?, ?)'
  ).run(entity, recordId, user);
}

function followRoute(db, entity, recordId, payload) {
  const user = cleanText(payload.user, 120);
  if (!user) return { status: 400, json: envelope(null, 'user is required') };
  addFollower(db, entity, recordId, user);
  return { status: 200, json: envelope({ entity, record_id: recordId, user, following: true }) };
}

function unfollowRoute(db, entity, recordId, payload) {
  const user = cleanText(payload.user, 120);
  if (!user) return { status: 400, json: envelope(null, 'user is required') };
  db.prepare(
    'DELETE FROM x_followers WHERE entity = ? AND record_id = ? AND user = ?'
  ).run(entity, recordId, user);
  return { status: 200, json: envelope({ entity, record_id: recordId, user, following: false }) };
}

// ---------------------------------------------------------------------------
// logChange — the crud-engine onWrite hook (auto-log entries, kind='log').
// Never throws: an audit-log failure must not abort the business write.
// ---------------------------------------------------------------------------
function logChange(db, entity, id, author, summary, meta) {
  try {
    ensureChatterTables(db);
    const item = {
      id: newId('ch'),
      entity: cleanText(entity, 120),
      record_id: cleanText(id, 120),
      kind: 'log',
      body: cleanText(summary),
      author: cleanText(author, 120) || 'system',
      created_at: nowIso(),
      meta: JSON.stringify(meta && typeof meta === 'object' ? meta : {}),
    };
    if (!item.entity || !item.record_id || !item.body) return null;
    db.prepare(
      `INSERT INTO x_chatter (id, entity, record_id, kind, body, author, activity_type, due_date, done, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', '', 0, ?, ?)`
    ).run(item.id, item.entity, item.record_id, item.kind, item.body, item.author, item.meta, item.created_at);
    notifyFollowers(db, item);
    return item.id;
  } catch (error) {
    console.warn('[chatter] logChange failed:', error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route dispatch shared by both adapters
// ---------------------------------------------------------------------------
// Path shapes:
//   GET    /api/x/chatter/:entity/:id
//   POST   /api/x/chatter/:entity/:id
//   POST   /api/x/chatter/:entity/:id/follow
//   DELETE /api/x/chatter/:entity/:id/follow
//   PATCH  /api/x/chatter/item/:chatterId/done
function dispatch(db, method, pathname, query, body) {
  const rest = pathname.slice(API_BASE.length).replace(/^\/+|\/+$/g, '');
  const parts = rest.split('/').map(decodeURIComponent).filter(Boolean);

  if (parts[0] === 'item' && parts.length === 3 && parts[2] === 'done' && method === 'PATCH') {
    const done = body && body.done !== undefined ? (body.done ? 1 : 0) : 1;
    return setActivityDone(db, parts[1], done);
  }

  if (parts.length === 2) {
    const [entity, recordId] = parts;
    if (method === 'GET') return { status: 200, json: listThread(db, entity, recordId, query) };
    if (method === 'POST') return postChatterItem(db, entity, recordId, body || {});
  }

  if (parts.length === 3 && parts[2] === 'follow') {
    const [entity, recordId] = parts;
    if (method === 'POST') return followRoute(db, entity, recordId, body || {});
    if (method === 'DELETE') return unfollowRoute(db, entity, recordId, body || query || {});
  }

  return { status: 404, json: envelope(null, 'chatter route not found') };
}

// ---------------------------------------------------------------------------
// Adapter 1: plain Node http (matches octagon server.js handler chain style:
//   if (chatter.handle(req, res, requestUrl)) return; )
// ---------------------------------------------------------------------------
function createChatterHandler(db) {
  ensureChatterTables(db);

  function respond(res, result) {
    const text = JSON.stringify(result.json);
    res.writeHead(result.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
  }

  function handle(req, res, requestUrl) {
    const url = requestUrl || new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (!url.pathname.startsWith(API_BASE + '/')) return false;

    const query = Object.fromEntries(url.searchParams.entries());
    if (req.method === 'GET') {
      try {
        respond(res, dispatch(db, 'GET', url.pathname, query, null));
      } catch (error) {
        respond(res, { status: 500, json: envelope(null, error.message || 'chatter failed') });
      }
      return true;
    }

    // Body-carrying verbs: buffer then dispatch.
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      let body = {};
      if (raw) {
        body = safeJsonParse(raw, null);
        if (body === null) return respond(res, { status: 400, json: envelope(null, 'Invalid JSON body') });
      }
      try {
        respond(res, dispatch(db, req.method, url.pathname, query, body));
      } catch (error) {
        respond(res, { status: 500, json: envelope(null, error.message || 'chatter failed') });
      }
    });
    return true;
  }

  return { handle };
}

// ---------------------------------------------------------------------------
// Adapter 2: Express-style mount (build-book signature). Works with real
// Express or any app exposing get/post/patch/delete(path, handler) with
// :params → req.params, req.query, req.body.
// ---------------------------------------------------------------------------
function mountChatter(app, db) {
  ensureChatterTables(db);

  function send(res, result) {
    if (typeof res.status === 'function') {
      res.status(result.status).json(result.json);
    } else {
      const text = JSON.stringify(result.json);
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(text);
    }
  }

  function wrap(fn) {
    return (req, res) => {
      try {
        send(res, fn(req));
      } catch (error) {
        send(res, { status: 500, json: envelope(null, error.message || 'chatter failed') });
      }
    };
  }

  app.get(`${API_BASE}/:entity/:id`, wrap(req => ({
    status: 200,
    json: listThread(db, req.params.entity, req.params.id, req.query || {}),
  })));

  app.post(`${API_BASE}/:entity/:id`, wrap(req =>
    postChatterItem(db, req.params.entity, req.params.id, req.body || {})));

  app.patch(`${API_BASE}/item/:chatterId/done`, wrap(req => {
    const body = req.body || {};
    const done = body.done !== undefined ? (body.done ? 1 : 0) : 1;
    return setActivityDone(db, req.params.chatterId, done);
  }));

  app.post(`${API_BASE}/:entity/:id/follow`, wrap(req =>
    followRoute(db, req.params.entity, req.params.id, req.body || {})));

  app.delete(`${API_BASE}/:entity/:id/follow`, wrap(req =>
    unfollowRoute(db, req.params.entity, req.params.id, req.body || req.query || {})));

  return app;
}

module.exports = {
  mountChatter,
  createChatterHandler,
  logChange,
  ensureChatterTables,
  // Exposed for tests
  _internal: { dispatch, listThread, postChatterItem, setActivityDone },
};
