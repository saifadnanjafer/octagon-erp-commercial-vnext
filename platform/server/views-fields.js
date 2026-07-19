// ============================================================================
// Octagon Commercial P0.7 — saved views and custom fields.
// Pattern re-expressed from:
//   - aureuserp-master/plugins/webkul/table-views/src/Models/TableView.php
//   - aureuserp-master/plugins/webkul/fields/src/Models/Field.php
//   - nocobase-main/docs/docs/en/data-sources/data-modeling/index.md
// Table views keep a user-owned filter/layout payload. Custom fields separate
// stable storage type from its UI interface and are stored in data.custom{}.
// This is a plain-http handler to match Octagon's server.js dispatcher.
// ============================================================================
'use strict';

const crypto = require('crypto');
const { writeAudit } = require('./audit');

const API_BASE = '/api/x';
const FIELD_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ENTITY_RE = /^[A-Za-z][A-Za-z0-9_]{0,119}$/;
const TYPES = new Set(['text', 'number', 'date', 'select', 'textarea']);
const MAX_BODY_BYTES = 256 * 1024;

function ensureViewsFieldsTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_views (
      id TEXT PRIMARY KEY, user TEXT, entity TEXT NOT NULL, name TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_x_views_entity_user ON x_views(entity, user);
    CREATE TABLE IF NOT EXISTS x_custom_fields (
      entity TEXT NOT NULL, key TEXT NOT NULL, label_ar TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text', options TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (entity, key)
    );
    CREATE INDEX IF NOT EXISTS idx_x_custom_fields_entity_position
      ON x_custom_fields(entity, position, key);
    CREATE TABLE IF NOT EXISTS x_audit (
      id TEXT PRIMARY KEY, entity TEXT NOT NULL, record_id TEXT NOT NULL,
      user TEXT, action TEXT NOT NULL, before TEXT, after TEXT, at TEXT NOT NULL
    );
  `);
}

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

function safeJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 2000);
}

function validEntity(entity) {
  return ENTITY_RE.test(String(entity || ''));
}

function normalOptions(value, type) {
  const parsed = typeof value === 'string' ? safeJson(value, null) : value;
  if (parsed == null) return [];
  if (!Array.isArray(parsed)) throw Object.assign(new Error('options يجب أن تكون قائمة JSON'), { statusCode: 400 });
  if (parsed.length > 200) throw Object.assign(new Error('عدد الخيارات كبير جداً'), { statusCode: 400 });
  return parsed.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return { value: String(item), label_ar: String(item) };
    if (!item || typeof item !== 'object') throw Object.assign(new Error('صيغة خيار الحقل غير صالحة'), { statusCode: 400 });
    const valueText = normalText(item.value, 160);
    if (!valueText) throw Object.assign(new Error('قيمة الخيار مطلوبة'), { statusCode: 400 });
    return { value: valueText, label_ar: normalText(item.label_ar || item.label || item.value, 160) };
  });
}

function normalizeViewConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('إعدادات طريقة العرض مطلوبة'), { statusCode: 400 });
  }
  const config = {};
  if (input.q != null) config.q = normalText(input.q, 500);
  if (input.filters != null) {
    if (!input.filters || typeof input.filters !== 'object' || Array.isArray(input.filters)) {
      throw Object.assign(new Error('filters يجب أن تكون كائناً'), { statusCode: 400 });
    }
    config.filters = input.filters;
  } else config.filters = {};
  if (input.sort != null) {
    if (typeof input.sort !== 'object' || Array.isArray(input.sort)) {
      throw Object.assign(new Error('sort يجب أن تكون كائناً'), { statusCode: 400 });
    }
    const key = normalText(input.sort.key, 64);
    if (key && !FIELD_KEY_RE.test(key)) throw Object.assign(new Error('مفتاح ترتيب غير صالح'), { statusCode: 400 });
    config.sort = key ? { key, dir: String(input.sort.dir).toLowerCase() === 'desc' ? 'desc' : 'asc' } : null;
  } else config.sort = null;
  if (input.columns != null) {
    if (!Array.isArray(input.columns) || input.columns.length > 100) {
      throw Object.assign(new Error('columns يجب أن تكون قائمة قصيرة'), { statusCode: 400 });
    }
    config.columns = input.columns.map((key) => {
      key = normalText(key, 64);
      if (!FIELD_KEY_RE.test(key) && !/^custom__[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) {
        throw Object.assign(new Error('مفتاح عمود غير صالح'), { statusCode: 400 });
      }
      return key;
    });
  }
  return config;
}

function rowToView(row) {
  return { id: row.id, user: row.user, entity: row.entity, name: row.name, config: safeJson(row.config, {}) };
}

function rowToField(row) {
  return {
    entity: row.entity, key: row.key, label_ar: row.label_ar, type: row.type,
    options: safeJson(row.options, []), position: Number(row.position) || 0,
  };
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error('payload too large'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (_) { reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function createViewsFieldsHandler(deps) {
  deps = deps || {};
  const db = deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('createViewsFieldsHandler requires a SQLite db handle');
  }
  ensureViewsFieldsTables(db);
  const sendJson = deps.sendJson || ((res, status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  });

  function actor(req, res) {
    if (typeof deps.requireSession === 'function') {
      const session = deps.requireSession(req, res);
      if (!session || !session.ok) return null;
      return { id: String(session.userId || 'unknown'), groups: Array.isArray(session.groups) ? session.groups : [], local: /^local-/.test(session.mode || '') };
    }
    // Header fallback exists solely for isolated throwaway harnesses.
    const id = normalText(req.headers && (req.headers['x-octagon-user'] || req.headers['x-user']), 120);
    const role = normalText(req.headers && req.headers['x-octagon-role'], 80);
    return id ? { id, groups: role === 'admin' ? ['system.admin'] : [], local: false } : null;
  }

  function requireActor(req, res) {
    const current = actor(req, res);
    if (current) return current;
    if (!res.writableEnded) sendJson(res, 401, envelope(null, 'تسجيل الدخول مطلوب'));
    return null;
  }

  function requireAdmin(req, res) {
    const current = requireActor(req, res);
    if (!current) return null;
    if (current.local || current.groups.includes('system.admin')) return current;
    sendJson(res, 403, envelope(null, 'صلاحية مدير النظام مطلوبة'));
    return null;
  }

  function audit(current, action, entity, recordId, before, after) {
    try { writeAudit(db, { entity, recordId, user: current.id, action, before, after }); } catch (_) { /* audit must not hide a completed write */ }
  }

  function respond(res, status, data, meta) { sendJson(res, status, envelope(data, null, meta)); }
  function fail(res, status, error) { sendJson(res, status, envelope(null, error)); }

  async function dispatch(req, res, url) {
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    const group = rest[0];
    if (group !== '_views' && group !== '_custom-fields') return false;
    const entity = rest[1];
    if (!validEntity(entity)) { fail(res, 400, 'اسم الكيان غير صالح'); return true; }

    try {
      if (group === '_views') {
        if (req.method === 'GET' && rest.length === 2) {
          const current = requireActor(req, res); if (!current) return true;
          const rows = db.prepare('SELECT id, user, entity, name, config FROM x_views WHERE entity = ? AND user = ? ORDER BY name COLLATE NOCASE, id').all(entity, current.id);
          respond(res, 200, rows.map(rowToView), { total: rows.length }); return true;
        }
        if (req.method === 'POST' && rest.length === 2) {
          const current = requireActor(req, res); if (!current) return true;
          const body = await readBody(req, MAX_BODY_BYTES);
          const name = normalText(body.name, 120);
          if (!name) { fail(res, 400, 'اسم طريقة العرض مطلوب'); return true; }
          const view = { id: newId('view'), user: current.id, entity, name, config: normalizeViewConfig(body.config) };
          db.prepare('INSERT INTO x_views (id, user, entity, name, config) VALUES (?, ?, ?, ?, ?)').run(view.id, view.user, view.entity, view.name, JSON.stringify(view.config));
          audit(current, 'create_view', entity, view.id, null, view); respond(res, 201, view); return true;
        }
        const viewId = rest[2];
        if ((req.method === 'PATCH' || req.method === 'DELETE') && rest.length === 3 && viewId) {
          const current = requireActor(req, res); if (!current) return true;
          const existing = db.prepare('SELECT id, user, entity, name, config FROM x_views WHERE id = ? AND entity = ?').get(viewId, entity);
          if (!existing) { fail(res, 404, 'طريقة العرض غير موجودة'); return true; }
          if (existing.user !== current.id) { fail(res, 403, 'لا يمكن تعديل طريقة عرض مستخدم آخر'); return true; }
          const before = rowToView(existing);
          if (req.method === 'DELETE') {
            db.prepare('DELETE FROM x_views WHERE id = ?').run(viewId);
            audit(current, 'delete_view', entity, viewId, before, null); respond(res, 200, { id: viewId, removed: true }); return true;
          }
          const body = await readBody(req, MAX_BODY_BYTES);
          const after = { ...before, name: body.name == null ? before.name : normalText(body.name, 120), config: body.config == null ? before.config : normalizeViewConfig(body.config) };
          if (!after.name) { fail(res, 400, 'اسم طريقة العرض مطلوب'); return true; }
          db.prepare('UPDATE x_views SET name = ?, config = ? WHERE id = ?').run(after.name, JSON.stringify(after.config), viewId);
          audit(current, 'update_view', entity, viewId, before, after); respond(res, 200, after); return true;
        }
      }

      if (group === '_custom-fields') {
        if (req.method === 'GET' && rest.length === 2) {
          const rows = db.prepare('SELECT entity, key, label_ar, type, options, position FROM x_custom_fields WHERE entity = ? ORDER BY position, key').all(entity);
          respond(res, 200, rows.map(rowToField), { total: rows.length }); return true;
        }
        if (req.method === 'POST' && rest.length === 2) {
          const current = requireAdmin(req, res); if (!current) return true;
          const body = await readBody(req, MAX_BODY_BYTES);
          const key = normalText(body.key, 64);
          const label_ar = normalText(body.label_ar, 120);
          const type = normalText(body.type || 'text', 20);
          if (!FIELD_KEY_RE.test(key) || !label_ar || !TYPES.has(type)) { fail(res, 400, 'مفتاح الحقل أو تسميته أو نوعه غير صالح'); return true; }
          const field = { entity, key, label_ar, type, options: normalOptions(body.options, type), position: Number.isFinite(Number(body.position)) ? Math.max(0, Math.floor(Number(body.position))) : 0 };
          db.prepare('INSERT INTO x_custom_fields (entity, key, label_ar, type, options, position) VALUES (?, ?, ?, ?, ?, ?)').run(entity, key, label_ar, type, JSON.stringify(field.options), field.position);
          audit(current, 'create_custom_field', entity, key, null, field); respond(res, 201, field); return true;
        }
        const key = rest[2];
        if ((req.method === 'PATCH' || req.method === 'DELETE') && rest.length === 3 && FIELD_KEY_RE.test(key)) {
          const current = requireAdmin(req, res); if (!current) return true;
          const row = db.prepare('SELECT entity, key, label_ar, type, options, position FROM x_custom_fields WHERE entity = ? AND key = ?').get(entity, key);
          if (!row) { fail(res, 404, 'الحقل المخصص غير موجود'); return true; }
          const before = rowToField(row);
          if (req.method === 'DELETE') {
            db.prepare('DELETE FROM x_custom_fields WHERE entity = ? AND key = ?').run(entity, key);
            audit(current, 'delete_custom_field', entity, key, before, null); respond(res, 200, { entity, key, removed: true }); return true;
          }
          const body = await readBody(req, MAX_BODY_BYTES);
          const after = { ...before, label_ar: body.label_ar == null ? before.label_ar : normalText(body.label_ar, 120), type: body.type == null ? before.type : normalText(body.type, 20), options: body.options == null ? before.options : normalOptions(body.options, body.type || before.type), position: body.position == null ? before.position : Math.max(0, Math.floor(Number(body.position))) };
          if (!after.label_ar || !TYPES.has(after.type) || !Number.isFinite(after.position)) { fail(res, 400, 'إعداد الحقل غير صالح'); return true; }
          db.prepare('UPDATE x_custom_fields SET label_ar = ?, type = ?, options = ?, position = ? WHERE entity = ? AND key = ?').run(after.label_ar, after.type, JSON.stringify(after.options), after.position, entity, key);
          audit(current, 'update_custom_field', entity, key, before, after); respond(res, 200, after); return true;
        }
      }
      fail(res, 404, 'مسار طريقة العرض أو الحقل غير موجود'); return true;
    } catch (error) {
      fail(res, error.statusCode || 500, error.message || 'تعذر تنفيذ الطلب'); return true;
    }
  }

  return {
    handle(req, res, requestUrl) {
      const url = requestUrl || new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const ours = url.pathname.startsWith(`${API_BASE}/_views/`) || url.pathname.startsWith(`${API_BASE}/_custom-fields/`);
      if (!ours) return false;
      dispatch(req, res, url).catch((error) => { if (!res.writableEnded) fail(res, error.statusCode || 500, error.message || 'تعذر تنفيذ الطلب'); });
      return true;
    },
  };
}

module.exports = { ensureViewsFieldsTables, createViewsFieldsHandler, _internal: { normalizeViewConfig, normalOptions, rowToField } };
