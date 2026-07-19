// clean-room; behavior modeled on platform/server/crud-engine.js (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const { nextSeq, hashRecordChain } = require('../sequences/sequences');
const { writeAudit, getHistory } = require('../audit/audit');
const acl = require('../acl/acl-engine');

const API_PREFIX = '/api/x/';
const RESERVED_SEGMENTS = new Set(['audit']);
const RECORD_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'created_by', 'company_id']);
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;
const MAX_BODY_BYTES = 1024 * 1024;

function loadRegistry(db) {
  const collections = db.prepare('SELECT * FROM collection_registry').all();
  const fields = db.prepare('SELECT * FROM field_registry').all();
  const reg = {};
  for (const c of collections) {
    reg[c.collection] = {
      label_ar: c.label_ar,
      label_ar_plural: c.label_ar_plural,
      section: c.section,
      sequence: c.sequence,
      seq_field: c.seq_field,
      chatter: Number(c.chatter) ? true : false,
      acl: c.acl,
      status_key: c.status_key || 'status',
      fields: {}
    };
  }
  for (const f of fields) {
    if (reg[f.collection]) {
      reg[f.collection].fields[f.field] = {
        type: f.type,
        label_ar: f.label_ar,
        required: Number(f.required) ? true : false,
        options: f.options ? JSON.parse(f.options) : undefined,
        default: f.def_val
      };
    }
  }
  return reg;
}

function resolveCompanyId(req, db) {
  let cid = (req.headers && req.headers['x-company-id']) || req.companyId;
  if (!cid) {
    try {
      const row = db.prepare('SELECT company_id FROM r0_tenant_root LIMIT 1').get();
      if (row) cid = row.company_id;
    } catch (_) {}
  }
  return cid ? String(cid).trim() : null;
}

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
    throw new Error('mountCrud: a sqlite handle is required');
  }

  let registry = null;
  function getRegistry() {
    if (!registry) {
      registry = loadRegistry(db);
      for (const name of Object.keys(registry)) {
        if (RESERVED_SEGMENTS.has(name)) {
          throw new Error(`mountCrud: entity name "${name}" is reserved`);
        }
      }
    }
    return registry;
  }

  const sendJson = deps.sendJson || ((res, status, payload) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  });

  const readBody = deps.readRequestBody || ((req, limit) => {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', chunk => {
        size += chunk.length;
        if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  });

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

  // T1.3.1(b): additive pre-write veto hooks (e.g. doc-state.js's posted-record
  // immutability guard). Distinct from `writeSubscribers`/`onWrite` above, which
  // are post-write notifications and cannot block a write. A guard returns a
  // human-readable Arabic error string to reject the write (HTTP 409), or a
  // falsy value to allow it. Never rewrites the write path itself — purely
  // additive, checked once up front in updateRecord()/deleteRecord().
  const writeGuards = [];
  function checkWriteGuards(entity, id, action, beforeDoc) {
    for (const fn of writeGuards) {
      let message;
      try {
        message = fn(entity, id, action, beforeDoc);
      } catch (error) {
        console.error(`[crud-engine] write guard threw (${entity}/${action}):`, error.message);
        continue;
      }
      if (message) return message;
    }
    return null;
  }

  function resolveUser(req) {
    const user = acl.resolveRequestUser(req, deps);
    return user || { userId: 'local', groups: [] };
  }

  function ok(res, status, data, meta) {
    sendJson(res, status, { success: true, data, error: null, meta: meta || null });
  }
  function fail(res, status, error) {
    sendJson(res, status, { success: false, data: null, error: String(error), meta: null });
  }

  function getRow(entity, id, companyId) {
    if (companyId) {
      return db
        .prepare('SELECT entity, id, company_id, data, created_at, updated_at, created_by, removed FROM x_records WHERE entity = ? AND id = ? AND company_id = ?')
        .get(entity, id, companyId);
    }
    return db
      .prepare('SELECT entity, id, company_id, data, created_at, updated_at, created_by, removed FROM x_records WHERE entity = ? AND id = ?')
      .get(entity, id);
  }

  function toDoc(row) {
    let data = {};
    try { data = JSON.parse(row.data); } catch (_) { data = {}; }
    return {
      ...data,
      id: row.id,
      company_id: row.company_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
      removed: Number(row.removed) || 0,
    };
  }

  function createRecord(entity, cfg, body, user, companyId) {
    if (!companyId) {
      const err = new Error('معرف الشركة (company_id) مطلوب');
      err.statusCode = 400;
      throw err;
    }
    const exists = db.prepare('SELECT company_id FROM r0_tenant_root WHERE company_id = ?').get(companyId);
    if (!exists) {
      const err = new Error('معرف الشركة غير صالح');
      err.statusCode = 400;
      throw err;
    }

    const writeErr = acl.checkForbiddenWrites(db, user, entity, body || {});
    if (writeErr) {
      const err = new Error(writeErr);
      err.statusCode = 403;
      throw err;
    }

    const now = new Date().toISOString();
    const data = { ...(body || {}) };
    delete data.removed;
    delete data.created_at;
    delete data.updated_at;
    delete data.created_by;
    delete data.company_id;
    const id = data.id ? String(data.id) : entity + '_' + crypto.randomUUID();
    delete data.id;

    const fields = cfg.fields || {};
    for (const [key, spec] of Object.entries(fields)) {
      if (data[key] === undefined && spec && spec.default !== undefined) data[key] = spec.default;
    }

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
      'INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
    ).run(entity, id, companyId, JSON.stringify(data), now, now, user.userId);

    if (cfg.sequence) {
      hashRecordChain(db, entity, id, companyId, data[cfg.seq_field || 'seq'] || '');
    }

    const doc = toDoc(getRow(entity, id, companyId));
    writeAudit(db, { entity, recordId: id, user: user.userId, action: 'create', before: null, after: doc });
    onWrite(entity, 'create', doc);
    return doc;
  }

  function updateRecord(entity, id, patch, user, companyId) {
    const row = getRow(entity, id, companyId);
    if (!row || Number(row.removed) === 1) return null;
    const before = toDoc(row);

    // T1.1.2 regression fix: this function's parameter list is
    // (entity, id, patch, user, companyId) — it never received `cfg` (unlike
    // createRecord(entity, cfg, ...), which does). The entity's registry
    // config is looked up here via getRegistry(), the same registry lookup
    // createRecord/summarize/handle() already use elsewhere in this file,
    // rather than threading `cfg` through every call site (handle()'s HTTP
    // route and the public engine.updateRecord() API both call this with the
    // (entity, id, patch, user, companyId) shape today; changing that shape
    // would be a wider, riskier diff for the same result).
    const entityCfg = getRegistry()[entity];

    // T1.3.1(b): posted/terminal-state documents are immutable outside of a
    // defined reversal transition. doc-state.js registers a guard (if
    // mounted) that vetoes this write when the record's current doc-state is
    // flagged terminal/immutable. The state-transition endpoint itself
    // writes to x_records directly (see doc-state.js handleTransition) and
    // never calls updateRecord/deleteRecord, so legitimate reversal
    // transitions are never blocked by this guard.
    const guardErr = checkWriteGuards(entity, id, 'update', before);
    if (guardErr) {
      const err = new Error(guardErr);
      err.statusCode = 409;
      throw err;
    }

    const writeErr = acl.checkForbiddenWrites(db, user, entity, patch || {}, before);
    if (writeErr) {
      const err = new Error(writeErr);
      err.statusCode = 403;
      throw err;
    }

    const incoming = { ...(patch || {}) };
    delete incoming.id;
    delete incoming.removed;
    delete incoming.created_at;
    delete incoming.updated_at;
    delete incoming.created_by;
    delete incoming.company_id;

    let current = {};
    try { current = JSON.parse(row.data); } catch (_) { current = {}; }
    const merged = { ...current, ...incoming };
    const now = new Date().toISOString();
    db.prepare('UPDATE x_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ? AND company_id = ?')
      .run(JSON.stringify(merged), now, entity, id, companyId);

    if (entityCfg && entityCfg.sequence) {
      hashRecordChain(db, entity, id, companyId, merged[entityCfg.seq_field || 'seq'] || '');
    }

    const doc = toDoc(getRow(entity, id, companyId));
    writeAudit(db, { entity, recordId: id, user: user.userId, action: 'update', before, after: doc });
    onWrite(entity, 'update', doc);
    return doc;
  }

  function deleteRecord(entity, id, user, companyId) {
    const row = getRow(entity, id, companyId);
    if (!row || Number(row.removed) === 1) return null;
    const before = toDoc(row);

    // T1.3.1(b): same posted-document immutability guard as updateRecord().
    const guardErr = checkWriteGuards(entity, id, 'delete', before);
    if (guardErr) {
      const err = new Error(guardErr);
      err.statusCode = 409;
      throw err;
    }

    db.prepare('UPDATE x_records SET removed = 1, updated_at = ? WHERE entity = ? AND id = ? AND company_id = ?')
      .run(new Date().toISOString(), entity, id, companyId);
    writeAudit(db, { entity, recordId: id, user: user.userId, action: 'delete', before, after: null });
    onWrite(entity, 'delete', before);
    return before;
  }

  function fieldExpr(field, params) {
    if (RECORD_COLUMNS.has(field)) return field;
    params.push('$.' + field);
    return 'json_extract(data, ?)';
  }

  const FILTER_OPS = {
    eq: '=', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
    '=': '=', '!=': '!=', '>': '>', '>=': '>=', '<': '<', '<=': '<=',
  };

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

  function listRecords(entity, query, companyId, user, scope) {
    const page = Math.max(1, parseInt(query.get('page'), 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.get('limit'), 10) || DEFAULT_LIMIT));
    const where = ['entity = ?', 'removed = 0'];
    const params = [entity];

    if (companyId) {
      where.push('company_id = ?');
      params.push(companyId);
    }

    if (scope === 'own') {
      where.push('created_by = ?');
      params.push(user.userId);
    }

    const q = (query.get('q') || '').trim();
    if (q) {
      where.push("data LIKE ? ESCAPE '\\'");
      params.push('%' + q.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%');
    }

    buildFilter(query.get('filter'), where, params);

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
        `SELECT entity, id, company_id, data, created_at, updated_at, created_by, removed FROM x_records WHERE ${whereSql} ORDER BY ${orderExpr} ${sortDir}, id ASC LIMIT ? OFFSET ?`
      )
      .all(...params, ...orderParams, limit, (page - 1) * limit);

    return { items: rows.map(toDoc).map(doc => acl.maskFields(db, user, entity, doc)), meta: { total: Number(total), page, limit } };
  }

  function summarize(entity, cfg, companyId) {
    const statusKey = cfg.status_key || 'status';
    if (!FIELD_NAME_RE.test(statusKey)) throw new Error(`invalid status_key "${statusKey}"`);
    
    let totalQuery = 'SELECT COUNT(*) AS n FROM x_records WHERE entity = ? AND removed = 0';
    let rowsQuery = 'SELECT COALESCE(json_extract(data, ?), \'(none)\') AS status, COUNT(*) AS n FROM x_records WHERE entity = ? AND removed = 0 GROUP BY 1 ORDER BY 2 DESC';
    const params = [entity];
    const rowsParams = ['$.' + statusKey, entity];
    
    if (companyId) {
      totalQuery += ' AND company_id = ?';
      rowsQuery = 'SELECT COALESCE(json_extract(data, ?), \'(none)\') AS status, COUNT(*) AS n FROM x_records WHERE entity = ? AND removed = 0 AND company_id = ? GROUP BY 1 ORDER BY 2 DESC';
      params.push(companyId);
      rowsParams.push(companyId);
    }

    const total = db.prepare(totalQuery).get(...params).n;
    const rows = db.prepare(rowsQuery).all(...rowsParams);
    
    const byStatus = {};
    for (const row of rows) byStatus[row.status] = Number(row.n);
    return { total: Number(total), status_key: statusKey, by_status: byStatus };
  }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || !pathname.startsWith(API_PREFIX)) return false;
    const segments = pathname.slice(API_PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
    const method = req.method;

    try {
      if (segments[0] === 'audit') {
        if (method !== 'GET' || segments.length !== 3) {
          fail(res, method === 'GET' ? 400 : 405, 'usage: GET /api/x/audit/:entity/:id');
          return true;
        }
        const user = resolveUser(req);
        const entityName = segments[1];
        const recordId = segments[2];
        const auditCfg = getRegistry()[entityName];
        if (!auditCfg) {
          fail(res, 404, `entity "${entityName || ''}" is not registered`);
          return true;
        }
        const aclKey = acl.entityAclKey(entityName, db);
        const scope = acl.scopeFor(db, user, `${aclKey}:read`);
        if (scope === null) {
          return fail(res, 403, 'غير مصرح لك بقراءة هذا السجل');
        }

        ok(res, 200, getHistory(db, entityName, recordId));
        return true;
      }

      const [entityName, verb, recordId] = segments;
      const cfg = getRegistry()[entityName];
      if (!cfg) {
        fail(res, 404, `entity "${entityName || ''}" is not registered`);
        return true;
      }

      const user = resolveUser(req);
      const aclKey = acl.entityAclKey(entityName, db);
      const actionMap = { create: 'create', read: 'read', update: 'update', delete: 'delete', list: 'read', summary: 'read' };
      const action = actionMap[verb];
      
      if (!action) {
        fail(res, 405, `unsupported action ${verb}`);
        return true;
      }

      const scope = acl.scopeFor(db, user, `${aclKey}:${action}`);
      if (scope === null) {
        fail(res, 403, `ليس لديك صلاحية تنفيذ هذا الإجراء [${aclKey}:${action}]`);
        return true;
      }

      const companyId = resolveCompanyId(req, db);

      if (verb === 'create' && method === 'POST') {
        readBody(req, MAX_BODY_BYTES)
          .then((raw) => {
            let body;
            try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return fail(res, 400, 'Invalid JSON body'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'body must be a JSON object');
            try {
              ok(res, 200, createRecord(entityName, cfg, body, user, companyId));
            } catch (error) {
              fail(res, error.statusCode || 500, error.message || 'create failed');
            }
          })
          .catch((error) => fail(res, 500, error.message || 'body read failed'));
        return true;
      }

      if (verb === 'read' && method === 'GET' && recordId) {
        const row = getRow(entityName, recordId, companyId);
        if (!row || Number(row.removed) === 1) { fail(res, 404, 'record not found'); return true; }
        const doc = toDoc(row);
        if (scope === 'own' && doc.created_by !== user.userId) {
          fail(res, 403, 'لا يمكنك الوصول إلا إلى سجلاتك الخاصة');
          return true;
        }
        ok(res, 200, acl.maskFields(db, user, entityName, doc));
        return true;
      }

      if (verb === 'update' && method === 'PATCH' && recordId) {
        readBody(req, MAX_BODY_BYTES)
          .then((raw) => {
            let body;
            try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return fail(res, 400, 'Invalid JSON body'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'body must be a JSON object');
            try {
              if (scope === 'own') {
                const row = getRow(entityName, recordId, companyId);
                if (!row || row.created_by !== user.userId) {
                  return fail(res, 403, 'لا يمكنك تعديل إلا سجلاتك الخاصة');
                }
              }
              const doc = updateRecord(entityName, recordId, body, user, companyId);
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
        if (scope === 'own') {
          const row = getRow(entityName, recordId, companyId);
          if (!row || row.created_by !== user.userId) {
            fail(res, 403, 'لا يمكنك حذف إلا سجلاتك الخاصة');
            return true;
          }
        }
        const doc = deleteRecord(entityName, recordId, user, companyId);
        if (!doc) { fail(res, 404, 'record not found'); return true; }
        ok(res, 200, { id: doc.id, removed: 1 });
        return true;
      }

      if (verb === 'list' && method === 'GET') {
        const { items, meta } = listRecords(entityName, requestUrl.searchParams, companyId, user, scope);
        ok(res, 200, items, meta);
        return true;
      }

      if (verb === 'summary' && method === 'GET') {
        ok(res, 200, summarize(entityName, cfg, companyId));
        return true;
      }

      fail(res, 405, `unsupported route ${method} ${pathname}`);
      return true;
    } catch (error) {
      fail(res, error.statusCode || 500, error.message || 'internal error');
      return true;
    }
  }

  const engine = {
    handle,
    get registry() { return getRegistry(); },
    subscribe(fn) {
      if (typeof fn === 'function') writeSubscribers.push(fn);
      return engine;
    },
    // T1.3.1(b): register a pre-write veto guard — see checkWriteGuards()
    // above. fn(entity, id, action, beforeDoc) -> Arabic error string to
    // reject the write, or a falsy value to allow it.
    registerGuard(fn) {
      if (typeof fn === 'function') writeGuards.push(fn);
      return engine;
    },
    createRecord: (entity, cfg, body, user, companyId) => createRecord(entity, cfg, body, user, companyId),
    updateRecord: (entity, id, patch, user, companyId) => updateRecord(entity, id, patch, user, companyId),
    deleteRecord: (entity, id, user, companyId) => deleteRecord(entity, id, user, companyId),
    getHistory: (entity, id) => getHistory(db, entity, id),
  };

  if (expressApp) {
    expressApp.use((req, res, next) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (!engine.handle(req, res, url)) next();
    });
  }

  return engine;
}

function scalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return JSON.stringify(value);
}

module.exports = { mountCrud };
