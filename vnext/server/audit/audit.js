// clean-room; behavior modeled on platform/server/audit.js (proprietary self, not copied)
'use strict';

const crypto = require('crypto');

// -----------------------------------------------------------------------
// Additive audit-event bus (R1 Lane C completion, T1.5.1).
//
// Every write anywhere in the kernel that goes through `writeAudit` — CRUD
// create/update/delete (crud-engine.js), doc-state transitions
// (state/doc-state.js writes `action: "state_transition_<name>"`), view/
// custom-field admin ops (fields/custom-fields.js) — lands here. This gives
// sibling modules a generic, read-only "something happened" hook WITHOUT
// crud-engine.js or doc-state.js needing to expose a dedicated pub/sub of
// their own (both are owned by other lanes and are not edited by this file).
// fields/snapshot-fields.js is the first consumer: it listens for
// `state_transition_*` entries to materialize snapshot fields at the
// configured transition. Subscriber failures never break the audit write
// itself (audit rows must stay reliable regardless of what listens to them).
// -----------------------------------------------------------------------
const subscribers = [];

/**
 * Register a listener that is invoked (best-effort, synchronously) after
 * every successful `writeAudit` call.
 * @param {(entry: {id:string, entity:string, recordId:string, user:string,
 *   action:string, before:object|null, after:object|null, at:string}) => void} fn
 * @returns {() => void} unsubscribe function
 */
function subscribeAudit(fn) {
  if (typeof fn !== 'function') return () => {};
  subscribers.push(fn);
  return () => {
    const index = subscribers.indexOf(fn);
    if (index >= 0) subscribers.splice(index, 1);
  };
}

function notifyAuditSubscribers(auditEntry) {
  for (const fn of subscribers) {
    try {
      fn(auditEntry);
    } catch (error) {
      console.error('[audit] subscriber failed:', error.message);
    }
  }
}

/**
 * Append an audit row.
 * @param {object} db sqlite handle
 * @param {{entity:string, recordId:string, user?:string, action:string,
 *          before?:object|null, after?:object|null, at?:string}} entry
 * @returns {string} the audit row id
 */
function writeAudit(db, entry) {
  if (!db) throw new Error('writeAudit: db handle is required');
  const entity = String(entry.entity || '').trim();
  const recordId = String(entry.recordId || entry.record_id || '').trim();
  const action = String(entry.action || '').trim();
  if (!entity || !recordId || !action) {
    throw new Error('writeAudit: entity, recordId and action are required');
  }

  const user = String(entry.user || 'system');
  const beforeRedacted = unconditionalRedact(redactPayload(db, user, entity, entry.before));
  const afterRedacted = unconditionalRedact(redactPayload(db, user, entity, entry.after));
  const at = entry.at || new Date().toISOString();

  const id = 'aud_' + crypto.randomUUID();
  db.prepare(
    'INSERT INTO x_audit (id, entity, record_id, user, action, before, after, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    entity,
    recordId,
    user,
    action,
    beforeRedacted == null ? null : JSON.stringify(beforeRedacted),
    afterRedacted == null ? null : JSON.stringify(afterRedacted),
    at
  );

  notifyAuditSubscribers({ id, entity, recordId, user, action, before: beforeRedacted, after: afterRedacted, at });
  return id;
}

function unconditionalRedact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  const keysToRedact = new Set(['password', 'passwordhash', 'password_hash', 'token', 'session', 'secret', 'key', 'apikey', 'api_key', 'private_key', 'otp']);
  for (const k of Object.keys(clone)) {
    if (keysToRedact.has(k.toLowerCase()) || k.toLowerCase().includes('secret') || k.toLowerCase().includes('password')) {
      clone[k] = '****';
    } else if (clone[k] && typeof clone[k] === 'object') {
      clone[k] = unconditionalRedact(clone[k]);
    }
  }
  return clone;
}

function redactPayload(db, user, entity, record) {
  if (!record || typeof record !== 'object') return record;
  const clone = { ...record };
  try {
    let role = null;
    const userRow = db.prepare('SELECT role FROM auth_sessions WHERE userId = ? ORDER BY expiresAt DESC LIMIT 1').get(user);
    if (userRow) role = userRow.role;
    if (!role) {
      const explicitRole = db.prepare('SELECT role FROM x_acl_roles WHERE role = ?').get(user);
      role = explicitRole ? explicitRole.role : 'operator';
    }
    if (role === 'admin') return record;

    const rules = db.prepare('SELECT field, access FROM x_acl_field_rules WHERE role = ? AND entity = ?').all(role, entity);
    for (const rule of rules) {
      if (rule.access === 'none') {
        delete clone[rule.field];
      } else if (rule.access === 'masked') {
        if (clone[rule.field] !== undefined) {
          clone[rule.field] = '****';
        }
      }
    }
  } catch (_) {}
  return clone;
}


function getHistory(db, entity, recordId, limit = 200) {
  const rows = db
    .prepare(
      'SELECT id, entity, record_id, user, action, before, after, at FROM x_audit WHERE entity = ? AND record_id = ? ORDER BY at DESC, id DESC LIMIT ?'
    )
    .all(String(entity), String(recordId), Math.max(1, Math.min(1000, Number(limit) || 200)));

  return rows.map((row) => {
    const before = safeParse(row.before);
    const after = safeParse(row.after);
    return {
      id: row.id,
      entity: row.entity,
      record_id: row.record_id,
      user: row.user,
      action: row.action,
      at: row.at,
      before,
      after,
      changes: diffObjects(before, after),
    };
  });
}

function diffObjects(before, after) {
  const a = before && typeof before === 'object' ? before : {};
  const b = after && typeof after === 'object' ? after : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes = {};
  for (const key of keys) {
    const from = a[key];
    const to = b[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[key] = { from: from === undefined ? null : from, to: to === undefined ? null : to };
    }
  }
  return changes;
}

function safeParse(text) {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

module.exports = { writeAudit, getHistory, diffObjects, subscribeAudit };
