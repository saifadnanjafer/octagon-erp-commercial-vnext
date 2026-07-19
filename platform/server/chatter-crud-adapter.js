// ============================================================================
// Octagon Commercial — P0.3 plain-http chatter + CRUD adapter
//
// The shared server is a Node http dispatcher, while chatter.js also supports
// an Express-shaped mount. This adapter supplies the native handler and binds
// the P0.1 post-write subscription without changing either shared module.
// Update field diffs are read from the append-only P0.4 audit snapshot that
// CRUD writes immediately before notifying subscribers.
//
// Pattern concepts: AureusERP HasChatter + Odoo mail activity history,
// re-expressed for Octagon's SQLite/Node stack.
// ============================================================================
'use strict';

const { createChatterHandler, logChange } = require('./chatter');
const { diffObjects } = require('./audit');

const TECHNICAL_FIELDS = new Set(['id', 'created_at', 'updated_at', 'created_by', 'removed']);
const FROZEN_ENTITY_RE = /(employee|timesheet|attendance|payroll)/i;

function safeParse(text, fallback) {
  try { return text == null ? fallback : JSON.parse(text); } catch (_) { return fallback; }
}

function latestAudit(db, entity, recordId, action) {
  const row = db.prepare(
    'SELECT user, before, after FROM x_audit WHERE entity = ? AND record_id = ? AND action = ? ORDER BY at DESC, id DESC LIMIT 1'
  ).get(entity, recordId, action);
  if (!row) return null;
  return {
    user: row.user || 'system',
    before: safeParse(row.before, null),
    after: safeParse(row.after, null),
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
    // Frozen HR/payroll domains are deliberately excluded even if a future
    // registry entry accidentally enables chatter for one of them.
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
      // This runs inside CRUD's non-blocking subscriber contract. Keep this
      // guard too so logging can never affect a completed business write.
      console.warn('[chatter-crud-adapter] auto-log skipped:', error.message);
    }
  });

  return crudEngine;
}

function mountChatterWithCrud({ db, crudEngine }) {
  const handler = createChatterHandler(db);
  subscribeCrudChatter({ db, crudEngine });
  return handler;
}

module.exports = { mountChatterWithCrud, subscribeCrudChatter, _internal: { changedBusinessFields, latestAudit } };
