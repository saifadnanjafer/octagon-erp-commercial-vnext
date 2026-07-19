// clean-room; behavior modeled on platform/server/chatter.js (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { diffObjects } = require('../audit/audit');
const acl = require('../acl/acl-engine');

const API_BASE = '/api/x/chatter';
const VALID_KINDS = ['message', 'log', 'activity'];
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const MAX_BODY_CHARS = 20000;

// T1.6.1(a): @username / @user_id mention tokens inside a message body.
const MENTION_RE = /@([A-Za-z0-9_.\-]{2,60})/g;

// T1.6.1(b): attachments — stored under vnext-data/files/ with a generated
// (never client-supplied) storage filename to prevent path traversal.
const ATTACHMENTS_DIR = path.resolve(__dirname, '../../../vnext-data/files');
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB raw file size
const MAX_ATTACHMENT_BODY_CHARS = 15 * 1024 * 1024; // JSON+base64 body ceiling

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

  if (kind === 'message' && author !== 'system') {
    addFollower(db, entity, recordId, author);
  }

  notifyFollowers(db, item);
  if (kind === 'message') notifyMentions(db, item);
  item.meta = safeJsonParse(item.meta, {});
  return { status: 201, json: envelope(item) };
}

/** Extract unique @mention tokens from a message body (deduplicated, order-preserving). */
function extractMentions(body) {
  if (!body) return [];
  const mentions = [];
  const seen = new Set();
  let match;
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(body))) {
    if (!seen.has(match[1])) { seen.add(match[1]); mentions.push(match[1]); }
  }
  return mentions;
}

/**
 * T1.6.1(a): notify each @mentioned user specifically, IN ADDITION TO (not
 * instead of) the follower notification already sent by notifyFollowers().
 */
function notifyMentions(db, item) {
  try {
    const mentioned = extractMentions(item.body).filter(user => user && user !== item.author);
    if (!mentioned.length) return;
    const summary = (item.body || '').slice(0, 180);
    const insert = db.prepare(
      `INSERT INTO x_notifications (id, user, title, body, link, read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    );
    mentioned.forEach(user => insert.run(
      newId('ntf'), user,
      `إشارة جديدة — ${item.entity}`,
      `${item.author} أشار إليك: ${summary}`,
      `#${item.entity}/${item.record_id}`,
      nowIso()
    ));
  } catch (_) {}
}

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
  } catch (_) {}
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
// T1.6.1(b) attachments — resolved user context, record-level ACL gate, and
// safe on-disk storage under vnext-data/files/.
// ---------------------------------------------------------------------------

/**
 * Resolve the requesting user for attachment ACL purposes. Prefers a real
 * session (deps.authSessionFromRequest, if the integrator wires it into
 * mountChatterWithCrud — see INTEGRATION.md) and falls back to x-user/x-roles
 * headers, matching the header-fallback convention already used throughout
 * this module's sibling engine (vnext/server/approvals/approvals.js).
 */
function resolveChatterUser(req, deps) {
  try {
    const active = deps.authSessionFromRequest && deps.authSessionFromRequest(req);
    const session = active && (active.session || active);
    if (session && (session.userId || session.id || session.user)) {
      const userId = String(session.userId || session.id || session.user);
      const groups = Array.isArray(session.groups) ? session.groups : (Array.isArray(session.roles) ? session.roles : []);
      const role = String(session.role || session.roleId || groups[0] || '');
      return { userId, role, roleId: role, groups };
    }
  } catch (_) {}
  const headers = req.headers || {};
  const userId = String(headers['x-user'] || 'local');
  const rawRoles = String(headers['x-roles'] || headers['x-role'] || '');
  const groups = rawRoles.split(',').map(r => r.trim()).filter(Boolean);
  return { userId, role: groups[0] || '', roleId: groups[0] || '', groups };
}

/**
 * Record-level ACL gate: same predicate the chatter thread's own record
 * belongs to — <entityAclKey>:read via acl.scopeFor(), narrowed by
 * acl.rowScopeAllows() for 'own'/'dept' scope. Returns false (deny) if the
 * entity has no matching x_records row and scope isn't 'all' (a bare read
 * grant alone is not enough to prove row ownership).
 */
function checkRecordReadAccess(db, user, entity, recordId) {
  const aclKey = acl.entityAclKey(entity, db);
  const scope = acl.scopeFor(db, user, `${aclKey}:read`);
  if (scope === null) return false;
  if (scope === 'all') return true;
  const row = db.prepare('SELECT created_by, data FROM x_records WHERE entity = ? AND id = ?').get(entity, recordId);
  let record = null;
  if (row) {
    let data = {};
    try { data = JSON.parse(row.data || '{}'); } catch (_) {}
    record = { created_by: row.created_by, department: data.department || data.dept || '' };
  }
  return acl.rowScopeAllows(user, scope, record);
}

function attachmentsDir() {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  return ATTACHMENTS_DIR;
}

/** Extension only (alnum, max 10 chars) — never the raw client filename. */
function safeExtension(filename) {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(String(filename || ''));
  return match ? '.' + match[1].toLowerCase() : '';
}

function rowToAttachment(row) {
  return {
    id: row.id, entity: row.entity, record_id: row.record_id, filename: row.filename,
    mime_type: row.mime_type, size: Number(row.size) || 0, uploader: row.uploader, created_at: row.created_at,
  };
}

function uploadAttachment(db, entity, recordId, user, body) {
  const filename = cleanText(body.filename, 255);
  const mimeType = cleanText(body.mime_type || body.mimeType, 120) || 'application/octet-stream';
  const dataBase64 = typeof body.data_base64 === 'string' ? body.data_base64
    : (typeof body.dataBase64 === 'string' ? body.dataBase64 : '');
  if (!filename) return { status: 400, json: envelope(null, 'filename is required') };
  if (!dataBase64) return { status: 400, json: envelope(null, 'data_base64 is required') };

  if (!checkRecordReadAccess(db, user, entity, recordId)) {
    return { status: 403, json: envelope(null, 'ليس لديك صلاحية الوصول لهذا السجل') };
  }

  let buffer;
  try { buffer = Buffer.from(dataBase64, 'base64'); } catch (_) {
    return { status: 400, json: envelope(null, 'data_base64 must be valid base64') };
  }
  if (!buffer.length) return { status: 400, json: envelope(null, 'attachment is empty') };
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return { status: 413, json: envelope(null, `الملف كبير جداً (الحد الأقصى ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB)`) };
  }

  const dir = attachmentsDir();
  const id = newId('att');
  const storageName = id + safeExtension(filename);
  const fullPath = path.join(dir, storageName);
  // Defensive re-check: storageName is generated (id + a validated short
  // extension) so it can never escape `dir`, but verify anyway.
  if (path.dirname(fullPath) !== dir) {
    return { status: 400, json: envelope(null, 'invalid file name') };
  }
  fs.writeFileSync(fullPath, buffer);

  const item = {
    id, entity, record_id: recordId, filename, storage_name: storageName,
    mime_type: mimeType, size: buffer.length, uploader: user.userId, created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO x_attachments (id, entity, record_id, filename, storage_name, mime_type, size, uploader, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(item.id, item.entity, item.record_id, item.filename, item.storage_name, item.mime_type, item.size, item.uploader, item.created_at);

  logChange(db, entity, recordId, user.userId, `أرفق ملفاً: ${filename}`, { source: 'attachment', attachment_id: id });

  return { status: 201, json: envelope(rowToAttachment(item)) };
}

function listAttachments(db, entity, recordId, user) {
  if (!checkRecordReadAccess(db, user, entity, recordId)) {
    return { status: 403, json: envelope(null, 'ليس لديك صلاحية الوصول لهذا السجل') };
  }
  const rows = db.prepare(
    'SELECT id, entity, record_id, filename, mime_type, size, uploader, created_at FROM x_attachments WHERE entity = ? AND record_id = ? ORDER BY created_at DESC'
  ).all(entity, recordId);
  return { status: 200, json: envelope(rows.map(rowToAttachment)) };
}

function downloadAttachment(db, attachmentId, user) {
  const row = db.prepare('SELECT * FROM x_attachments WHERE id = ?').get(cleanText(attachmentId, 180));
  if (!row) return { status: 404, json: envelope(null, 'attachment not found') };
  if (!checkRecordReadAccess(db, user, row.entity, row.record_id)) {
    return { status: 403, json: envelope(null, 'ليس لديك صلاحية الوصول لهذا المرفق') };
  }
  const fullPath = path.join(attachmentsDir(), row.storage_name);
  if (!fs.existsSync(fullPath)) return { status: 404, json: envelope(null, 'attachment file missing on disk') };
  return { status: 200, stream: { path: fullPath, filename: row.filename, mimeType: row.mime_type } };
}

function streamFile(res, file) {
  const stat = fs.statSync(file.path);
  const safeName = encodeURIComponent(file.filename || 'attachment');
  res.writeHead(200, {
    'Content-Type': file.mimeType || 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`,
  });
  fs.createReadStream(file.path).pipe(res);
}

function logChange(db, entity, id, author, summary, meta) {
  try {
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
  } catch (_) {
    return null;
  }
}

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

function isSqliteHandle(value) {
  return Boolean(value) && typeof value.prepare === 'function' && typeof value.exec === 'function';
}

/** Accepts either a bare sqlite handle (legacy call sites) or a {db, authSessionFromRequest} deps object. */
function normalizeChatterDeps(depsOrDb) {
  return isSqliteHandle(depsOrDb) ? { db: depsOrDb } : (depsOrDb || {});
}

function createChatterHandler(depsOrDb) {
  const deps = normalizeChatterDeps(depsOrDb);
  const db = deps.db;
  if (!isSqliteHandle(db)) throw new Error('createChatterHandler requires a sqlite db handle (or a {db,...} deps object)');

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
    const parts = url.pathname.slice(API_BASE.length).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map(decodeURIComponent);

    // ---- Attachment routes (need resolved user context + a bigger body limit) ----
    const isAttachmentDownload = parts.length === 2 && parts[0] === 'attachments' && req.method === 'GET';
    const isAttachmentList = parts.length === 3 && parts[2] === 'attachments' && req.method === 'GET';
    const isAttachmentUpload = parts.length === 3 && parts[2] === 'attachments' && req.method === 'POST';

    if (isAttachmentDownload) {
      const user = resolveChatterUser(req, deps);
      const result = downloadAttachment(db, parts[1], user);
      if (result.stream) { streamFile(res, result.stream); return true; }
      respond(res, result);
      return true;
    }
    if (isAttachmentList) {
      const user = resolveChatterUser(req, deps);
      try { respond(res, listAttachments(db, parts[0], parts[1], user)); }
      catch (error) { respond(res, { status: 500, json: envelope(null, error.message || 'chatter failed') }); }
      return true;
    }
    if (isAttachmentUpload) {
      const user = resolveChatterUser(req, deps);
      let raw = '';
      req.on('data', chunk => { raw += chunk; if (raw.length > MAX_ATTACHMENT_BODY_CHARS) req.destroy(); });
      req.on('end', () => {
        const body = raw ? safeJsonParse(raw, null) : {};
        if (body === null) return respond(res, { status: 400, json: envelope(null, 'Invalid JSON body') });
        try { respond(res, uploadAttachment(db, parts[0], parts[1], user, body || {})); }
        catch (error) { respond(res, { status: 500, json: envelope(null, error.message || 'upload failed') }); }
      });
      return true;
    }

    // ---- Existing thread/follow routes (unchanged) ----
    if (req.method === 'GET') {
      try {
        respond(res, dispatch(db, 'GET', url.pathname, query, null));
      } catch (error) {
        respond(res, { status: 500, json: envelope(null, error.message || 'chatter failed') });
      }
      return true;
    }

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

const TECHNICAL_FIELDS = new Set(['id', 'created_at', 'updated_at', 'created_by', 'removed', 'company_id']);
const FROZEN_ENTITY_RE = /(employee|timesheet|attendance|payroll)/i;

function latestAudit(db, entity, recordId, action) {
  const row = db.prepare(
    'SELECT user, before, after FROM x_audit WHERE entity = ? AND record_id = ? AND action = ? ORDER BY at DESC, id DESC LIMIT 1'
  ).get(entity, recordId, action);
  if (!row) return null;
  return {
    user: row.user || 'system',
    before: safeJsonParse(row.before, null),
    after: safeJsonParse(row.after, null),
  };
}

function changedBusinessFields(before, after) {
  return Object.keys(diffObjects(before, after)).filter(key => !TECHNICAL_FIELDS.has(key));
}

function labelForField(registry, entity, field) {
  const cfg = registry && registry[entity];
  return (cfg && cfg.fields && cfg.fields[field] && cfg.fields[field].label_ar) || field;
}

function subscribeCrudChatter({ db, crudEngine }) {
  if (!db || typeof db.prepare !== 'function') throw new Error('subscribeCrudChatter: sqlite db is required');
  if (!crudEngine || typeof crudEngine.subscribe !== 'function') {
    throw new Error('subscribeCrudChatter: mounted CRUD engine is required');
  }

  crudEngine.subscribe((entity, action, record) => {
    const cfg = crudEngine.registry && crudEngine.registry[entity];
    if (!cfg || !cfg.chatter || FROZEN_ENTITY_RE.test(entity)) return;
    if (action !== 'create' && action !== 'update') return;

    try {
      const audit = latestAudit(db, entity, record.id, action);
      const author = (audit && audit.user) || record.created_by || 'system';
      const fields = action === 'update'
        ? changedBusinessFields(audit && audit.before, audit && audit.after)
        : [];
      const fieldLabels = fields.map(field => labelForField(crudEngine.registry, entity, field));
      const summary = action === 'create'
        ? `تم إنشاء سجل ${cfg.label_ar || entity}.`
        : fieldLabels.length
          ? `تم تحديث الحقول: ${fieldLabels.join('، ')}.`
          : 'تم تحديث السجل.';

      logChange(db, entity, record.id, author, summary, {
        source: 'crud-engine',
        action,
        changes: action === 'update' ? diffObjects(audit && audit.before, audit && audit.after) : {},
      });
    } catch (error) {
      console.warn('[chatter-crud-adapter] auto-log skipped:', error.message);
    }
  });

  return crudEngine;
}

function mountChatterWithCrud({ db, crudEngine, authSessionFromRequest }) {
  // authSessionFromRequest is optional: when the integrator wires it through
  // (see INTEGRATION.md), attachment ACL checks resolve the real session;
  // otherwise they fall back to x-user/x-roles headers.
  const handler = createChatterHandler({ db, authSessionFromRequest });
  subscribeCrudChatter({ db, crudEngine });
  return handler;
}

function mountChatter(app, db) {
  const handler = createChatterHandler(db);
  if (app && typeof app.use === 'function') {
    app.use((req, res, next) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (!handler.handle(req, res, url)) next();
    });
  }
  return handler;
}

module.exports = {
  mountChatter,
  mountChatterWithCrud,
  createChatterHandler,
  logChange,
  _internal: {
    dispatch, listThread, postChatterItem, setActivityDone,
    extractMentions, notifyMentions, uploadAttachment, listAttachments, downloadAttachment,
    checkRecordReadAccess, resolveChatterUser,
    addFollower, followRoute, unfollowRoute,
  },
};
