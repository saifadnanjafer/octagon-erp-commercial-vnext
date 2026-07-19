// ============================================================================
// Octagon Commercial — generic CRUD engine (packet P0.1)
// Pattern ported from idurar-erp-crm createCRUDController/* (create/read/
// update/remove/paginatedList/summary verbs + entity registry idea from
// models/utils/index.js), re-expressed for plain Node http + SQLite JSON
// storage (x_records) — no Mongoose, no Express dependency.
//
// REALITY CHECK (2026-07-17): octagon-erp/server.js is a plain
// http.createServer dispatcher (NOT Express) and its SQLite handle is a
// node:sqlite DatabaseSync (NOT better-sqlite3). Sub-modules mount via the
// `handle(req, res, requestUrl) -> boolean` pattern (see jarvisSecurity /
// octagonScheduler). This engine therefore exposes:
//
//   const engine = mountCrud({ db: dbSync, sendJson?, readRequestBody?,
//                              authSessionFromRequest? });
//   ... inside createServer: if (engine.handle(req, res, requestUrl)) return;
//
// It ALSO accepts the Express-style signature mountCrud(app, db) — if the
// first argument has a .use() function the engine self-registers as a
// middleware — so the module keeps working if the platform ever moves to
// Express. Both node:sqlite DatabaseSync and better-sqlite3 handles work
// (identical prepare()/exec() surface for everything used here).
//
// API (build book §4), registered entities only (404 otherwise):
//   POST   /api/x/:entity/create
//   GET    /api/x/:entity/read/:id
//   PATCH  /api/x/:entity/update/:id
//   DELETE /api/x/:entity/delete/:id      (soft delete: removed=1)
//   GET    /api/x/:entity/list?page&limit&sort&q&filter=<json>
//   GET    /api/x/:entity/summary
//   GET    /api/x/audit/:entity/:id       (record history — packet P0.4)
// Envelope: { success, data, error, meta:{ total, page, limit } | null }
//
// Hooks on every write: sequence assignment on create (sequences.js),
// audit row (audit.js), then the onWrite() fan-out (no-op by default) that
// chatter (P0.3) and workflow (P0.10) subscribe to later.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nextSeq } = require('./sequences');
const { writeAudit, getHistory } = require('./audit');

// Requiring this module without mounting is safe: nothing below touches a
// database or the filesystem at load time (verified by the --dry require
// test in TEST.md). All side effects happen inside mountCrud().

const API_PREFIX = '/api/x/';
// First path segments that are platform routes, never entity names.
const RESERVED_SEGMENTS = new Set(['audit']);
// Real columns on x_records; anything else sorts/filters via json_extract.
const RECORD_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'created_by']);
// json field names must look like plain identifiers (defense: the json path
// is bound as a parameter, but this also rejects garbage early).
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB per write request

/**
 * Mount the CRUD engine.
 * Signature A (octagon reality): mountCrud({ db, sendJson?, readRequestBody?,
 *   authSessionFromRequest?, entitiesFile?, tablesFile? }) -> { handle, ... }
 * Signature B (Express-style):   mountCrud(app, db)        -> same, and
 *   self-registers app.use(middleware).
 */
function mountCrud(appOrDeps, maybeDb) {
  let deps;
  let expressApp = null;
  if (appOrDeps && typeof appOrDeps.use === 'function' && maybeDb) {
    expressApp = appOrDeps;
    deps = { db: maybeDb };
  } else {
    deps = appOrDeps || {};
  }
  const db = deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('mountCrud: a sqlite handle with prepare()/exec() is required (deps.db)');
  }

  // --- one-time setup: platform tables + entity registry -------------------
  const tablesFile = deps.tablesFile || path.join(__dirname, 'x-tables.sql');
  db.exec(fs.readFileSync(tablesFile, 'utf8'));

  const entitiesFile = deps.entitiesFile || path.join(__dirname, 'entities.json');
  const registry = JSON.parse(fs.readFileSync(entitiesFile, 'utf8'));
  for (const name of Object.keys(registry)) {
    if (RESERVED_SEGMENTS.has(name)) {
      throw new Error(`mountCrud: entity name "${name}" is reserved`);
    }
  }

  const sendJson = deps.sendJson || defaultSendJson;
  const readBody = deps.readRequestBody || defaultReadRequestBody;

  // --- onWrite hook (documented no-op) --------------------------------------
  // Subscribers receive (entity, action, record) AFTER the row + audit are
  // committed. action ∈ 'create' | 'update' | 'delete'. record is the full
  // stored document (for delete: the last snapshot before removal).
  // Chatter auto-log (P0.3) and workflow triggers (P0.10) subscribe via
  // engine.subscribe(fn). Subscriber errors are logged, never break the API.
  const writeSubscribers = [];
  function onWrite(entity, action, record) {
    for (const fn of writeSubscribers) {
      try {
        fn(entity, action, record);
      } catch (error) {
        console.error(`[crud-engine] onWrite subscriber failed (${entity}/${action}):`, error.message);
      }
    }
  }

  function resolveUser(req) {
    // created_by: prefer the real login session the server already tracks,
    // then an explicit x-user header (harness/tests), then 'local' (trusted
    // localhost console — same stance as the legacy endpoints).
    try {
      const active = deps.authSessionFromRequest && deps.authSessionFromRequest(req);
      if (active && active.session && active.session.userId) return String(active.session.userId);
    } catch (_) { /* session lookup must never break a CRUD call */ }
    const header = req.headers && req.headers['x-user'];
    if (header) return String(header).slice(0, 120);
    return 'local';
  }

  function ok(res, status, data, meta) {
    sendJson(res, status, { success: true, data, error: null, meta: meta || null });
  }
  function fail(res, status, error) {
    sendJson(res, status, { success: false, data: null, error: String(error), meta: null });
  }

  // --- verbs (each one mirrors an idurar createCRUDController file) --------

  function getRow(entity, id) {
    return db
      .prepare('SELECT entity, id, data, created_at, updated_at, created_by, removed FROM x_records WHERE entity = ? AND id = ?')
      .get(entity, id);
  }

  function toDoc(row) {
    let data = {};
    try { data = JSON.parse(row.data); } catch (_) { data = {}; }
    return {
      ...data,
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
      removed: Number(row.removed) || 0,
    };
  }

  // pattern from idurar createCRUDController/create.js
  function createRecord(entity, cfg, body, user) {
    const now = new Date().toISOString();
    const data = { ...(body || {}) };
    delete data.removed; // storage-managed
    delete data.created_at;
    delete data.updated_at;
    delete data.created_by;
    const id = data.id ? String(data.id) : entity + '_' + crypto.randomUUID();
    delete data.id;

    // Apply field defaults from the registry (only for absent keys).
    const fields = cfg.fields || {};
    for (const [key, spec] of Object.entries(fields)) {
      if (data[key] === undefined && spec && spec.default !== undefined) data[key] = spec.default;
    }

    // P0.4 hook: assign the document number when the entity declares one.
    if (cfg.sequence) {
      const seqField = cfg.seq_field || 'seq';
      if (!data[seqField]) {
        const issued = nextSeq(db, cfg.seq_key || entity, cfg.sequence);
        data[seqField] = issued.formatted;
      }
    }

    if (getRow(entity, id)) {
      const err = new Error(`record "${id}" already exists`);
      err.statusCode = 409;
      throw err;
    }
    db.prepare(
      'INSERT INTO x_records (entity, id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run(entity, id, JSON.stringify(data), now, now, user);

    const doc = toDoc(getRow(entity, id));
    writeAudit(db, { entity, recordId: id, user, action: 'create', before: null, after: doc });
    onWrite(entity, 'create', doc);
    return doc;
  }

  // pattern from idurar createCRUDController/update.js (shallow merge patch)
  function updateRecord(entity, id, patch, user) {
    const row = getRow(entity, id);
    if (!row || Number(row.removed) === 1) return null;
    const before = toDoc(row);

    const incoming = { ...(patch || {}) };
    delete incoming.id;
    delete incoming.removed;
    delete incoming.created_at;
    delete incoming.updated_at;
    delete incoming.created_by;

    let current = {};
    try { current = JSON.parse(row.data); } catch (_) { current = {}; }
    const merged = { ...current, ...incoming };
    const now = new Date().toISOString();
    db.prepare('UPDATE x_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ?')
      .run(JSON.stringify(merged), now, entity, id);

    const doc = toDoc(getRow(entity, id));
    writeAudit(db, { entity, recordId: id, user, action: 'update', before, after: doc });
    onWrite(entity, 'update', doc);
    return doc;
  }

  // pattern from idurar createCRUDController/remove.js (soft delete)
  function deleteRecord(entity, id, user) {
    const row = getRow(entity, id);
    if (!row || Number(row.removed) === 1) return null;
    const before = toDoc(row);
    db.prepare('UPDATE x_records SET removed = 1, updated_at = ? WHERE entity = ? AND id = ?')
      .run(new Date().toISOString(), entity, id);
    writeAudit(db, { entity, recordId: id, user, action: 'delete', before, after: null });
    onWrite(entity, 'delete', before);
    return before;
  }

  // Build one SQL condition for a field. Real columns compare directly;
  // JSON fields go through json_extract(data, ?) with the path BOUND as a
  // parameter — field names never reach the SQL string.
  function fieldExpr(field, params) {
    if (RECORD_COLUMNS.has(field)) return field;
    params.push('$.' + field);
    return 'json_extract(data, ?)';
  }

  const FILTER_OPS = {
    eq: '=', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
    '=': '=', '!=': '!=', '>': '>', '>=': '>=', '<': '<', '<=': '<=',
  };

  // filter=<json>: {"status":"new"} equality, or ranges/sets per field:
  // {"value":{"gte":100,"lt":500},"status":{"in":["new","qualified"]},"name":{"like":"احمد"}}
  function buildFilter(filterJson, where, params) {
    if (!filterJson) return;
    let filter;
    try {
      filter = JSON.parse(filterJson);
    } catch (_) {
      const err = new Error('filter must be valid JSON');
      err.statusCode = 400;
      throw err;
    }
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      const err = new Error('filter must be a JSON object');
      err.statusCode = 400;
      throw err;
    }
    for (const [field, cond] of Object.entries(filter)) {
      if (!FIELD_NAME_RE.test(field)) {
        const err = new Error(`invalid filter field "${field}"`);
        err.statusCode = 400;
        throw err;
      }
      if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
        for (const [op, value] of Object.entries(cond)) {
          if (op === 'in' && Array.isArray(value)) {
            if (!value.length) { where.push('0'); continue; }
            const expr = fieldExpr(field, params);
            where.push(`${expr} IN (${value.map(() => '?').join(', ')})`);
            params.push(...value.map(scalar));
          } else if (op === 'like') {
            const expr = fieldExpr(field, params);
            where.push(`${expr} LIKE ?`);
            params.push('%' + String(value) + '%');
          } else if (FILTER_OPS[op]) {
            const expr = fieldExpr(field, params);
            where.push(`${expr} ${FILTER_OPS[op]} ?`);
            params.push(scalar(value));
          } else {
            const err = new Error(`unsupported filter operator "${op}"`);
            err.statusCode = 400;
            throw err;
          }
        }
      } else {
        const expr = fieldExpr(field, params);
        where.push(`${expr} = ?`);
        params.push(scalar(cond));
      }
    }
  }

  // pattern from idurar createCRUDController/paginatedList.js + search.js
  function listRecords(entity, query) {
    const page = Math.max(1, parseInt(query.get('page'), 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.get('limit'), 10) || DEFAULT_LIMIT));
    const where = ['entity = ?', 'removed = 0'];
    const params = [entity];

    // q: free-text LIKE over the raw JSON document (build book §P0.1).
    const q = (query.get('q') || '').trim();
    if (q) {
      where.push("data LIKE ? ESCAPE '\\'");
      params.push('%' + q.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%');
    }

    buildFilter(query.get('filter'), where, params);

    // sort: "field", "field:asc", "field:desc" or "-field". Default newest.
    let sortField = 'updated_at';
    let sortDir = 'DESC';
    const rawSort = (query.get('sort') || '').trim();
    if (rawSort) {
      let field = rawSort;
      if (field.startsWith('-')) { field = field.slice(1); sortDir = 'DESC'; }
      else if (field.includes(':')) {
        const [f, d] = field.split(':');
        field = f;
        sortDir = String(d).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      } else {
        sortDir = 'ASC';
      }
      if (!FIELD_NAME_RE.test(field)) {
        const err = new Error(`invalid sort field "${field}"`);
        err.statusCode = 400;
        throw err;
      }
      sortField = field;
    }
    const orderParams = [];
    const orderExpr = fieldExpr(sortField, orderParams);

    const whereSql = where.join(' AND ');
    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM x_records WHERE ${whereSql}`)
      .get(...params).n;
    const rows = db
      .prepare(
        `SELECT entity, id, data, created_at, updated_at, created_by, removed FROM x_records WHERE ${whereSql} ORDER BY ${orderExpr} ${sortDir}, id ASC LIMIT ? OFFSET ?`
      )
      .all(...params, ...orderParams, limit, (page - 1) * limit);

    return { items: rows.map(toDoc), meta: { total: Number(total), page, limit } };
  }

  // pattern from idurar createCRUDController/summary.js, upgraded to a
  // group-by over the entity's configured status key (build book §P0.1).
  function summarize(entity, cfg) {
    const statusKey = cfg.status_key || 'status';
    if (!FIELD_NAME_RE.test(statusKey)) throw new Error(`invalid status_key "${statusKey}"`);
    const total = db
      .prepare('SELECT COUNT(*) AS n FROM x_records WHERE entity = ? AND removed = 0')
      .get(entity).n;
    const rows = db
      .prepare(
        'SELECT COALESCE(json_extract(data, ?), \'(none)\') AS status, COUNT(*) AS n FROM x_records WHERE entity = ? AND removed = 0 GROUP BY 1 ORDER BY 2 DESC'
      )
      .all('$.' + statusKey, entity);
    const byStatus = {};
    for (const row of rows) byStatus[row.status] = Number(row.n);
    return { total: Number(total), status_key: statusKey, by_status: byStatus };
  }

  // --- HTTP dispatch --------------------------------------------------------

  /**
   * Route an /api/x/* request. Returns true when handled (server.js pattern:
   * `if (engine.handle(req, res, requestUrl)) return;`).
   */
  function handle(req, res, requestUrl) {
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || !pathname.startsWith(API_PREFIX)) return false;
    const segments = pathname.slice(API_PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
    const method = req.method;

    try {
      // P0.4 record history: GET /api/x/audit/:entity/:id
      if (segments[0] === 'audit') {
        if (method !== 'GET' || segments.length !== 3) {
          fail(res, method === 'GET' ? 400 : 405, 'usage: GET /api/x/audit/:entity/:id');
          return true;
        }
        ok(res, 200, getHistory(db, segments[1], segments[2]));
        return true;
      }

      const [entityName, verb, recordId] = segments;
      const cfg = registry[entityName];
      if (!cfg) {
        fail(res, 404, `entity "${entityName || ''}" is not registered`);
        return true;
      }

      if (verb === 'create' && method === 'POST') {
        const user = resolveUser(req);
        readBody(req, MAX_BODY_BYTES)
          .then((raw) => {
            let body;
            try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return fail(res, 400, 'Invalid JSON body'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'body must be a JSON object');
            try {
              ok(res, 200, createRecord(entityName, cfg, body, user));
            } catch (error) {
              fail(res, error.statusCode || 500, error.message || 'create failed');
            }
          })
          .catch((error) => fail(res, 500, error.message || 'body read failed'));
        return true;
      }

      if (verb === 'read' && method === 'GET' && recordId) {
        const row = getRow(entityName, recordId);
        if (!row || Number(row.removed) === 1) { fail(res, 404, 'record not found'); return true; }
        ok(res, 200, toDoc(row));
        return true;
      }

      if (verb === 'update' && method === 'PATCH' && recordId) {
        const user = resolveUser(req);
        readBody(req, MAX_BODY_BYTES)
          .then((raw) => {
            let body;
            try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return fail(res, 400, 'Invalid JSON body'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'body must be a JSON object');
            try {
              const doc = updateRecord(entityName, recordId, body, user);
              if (!doc) return fail(res, 404, 'record not found');
              ok(res, 200, doc);
            } catch (error) {
              fail(res, error.statusCode || 500, error.message || 'update failed');
            }
          })
          .catch((error) => fail(res, 500, error.message || 'body read failed'));
        return true;
      }

      if (verb === 'delete' && method === 'DELETE' && recordId) {
        const doc = deleteRecord(entityName, recordId, resolveUser(req));
        if (!doc) { fail(res, 404, 'record not found'); return true; }
        ok(res, 200, { id: doc.id, removed: 1 });
        return true;
      }

      if (verb === 'list' && method === 'GET') {
        const { items, meta } = listRecords(entityName, requestUrl.searchParams);
        ok(res, 200, items, meta);
        return true;
      }

      if (verb === 'summary' && method === 'GET') {
        ok(res, 200, summarize(entityName, cfg));
        return true;
      }

      fail(res, 405, `unsupported route ${method} ${pathname}`);
      return true;
    } catch (error) {
      // Any synchronous failure still answers in-envelope (never a hang).
      fail(res, error.statusCode || 500, error.message || 'internal error');
      return true;
    }
  }

  const engine = {
    handle,
    registry,
    // onWrite subscription point (chatter/workflow — see comment above).
    subscribe(fn) {
      if (typeof fn === 'function') writeSubscribers.push(fn);
      return engine;
    },
    // Programmatic access for other platform packets (seed script, workflow).
    createRecord,
    updateRecord,
    deleteRecord,
    getHistory: (entity, id) => getHistory(db, entity, id),
  };

  if (expressApp) {
    // Express-style mount: delegate to handle(); pass through when not ours.
    expressApp.use((req, res, next) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (!engine.handle(req, res, url)) next();
    });
  }

  return engine;
}

// Coerce a JSON filter value into something SQLite can bind: booleans become
// 1/0, numbers/strings pass through, anything else is stringified.
function scalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return JSON.stringify(value);
}

// --- fallback helpers (used when server.js deps are not injected) -----------

function defaultSendJson(res, status, payload) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function defaultReadRequestBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = { mountCrud };
