// ============================================================================
// Octagon Commercial — audit trail / record history (packet P0.4)
// Pattern from NocoBase plugin-audit-logger + plugin-record-history docs,
// re-expressed for SQLite.
//
// writeAudit(db, entry)          — append one x_audit row (never updated).
// getHistory(db, entity, id)     — rows newest-first with parsed snapshots
//                                  and a computed per-field {from,to} diff.
// The GET /api/x/audit/:entity/:id route itself is registered inside
// crud-engine.js mountCrud() (same handle() dispatcher), using getHistory().
// ============================================================================
'use strict';

const crypto = require('crypto');

/**
 * Append an audit row. before/after are plain objects (or null); they are
 * stored as JSON snapshots. Rows are append-only — corrections are new rows.
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
  const id = 'aud_' + crypto.randomUUID();
  db.prepare(
    'INSERT INTO x_audit (id, entity, record_id, user, action, before, after, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    entity,
    recordId,
    String(entry.user || 'system'),
    action,
    entry.before == null ? null : JSON.stringify(entry.before),
    entry.after == null ? null : JSON.stringify(entry.after),
    entry.at || new Date().toISOString()
  );
  return id;
}

/**
 * Record history: audit rows for one record, newest first, each with a
 * computed field-level diff (`changes`: { field: { from, to } }).
 */
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

/** Shallow field diff between two snapshots -> { field: {from, to} }. */
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

module.exports = { writeAudit, getHistory, diffObjects };
