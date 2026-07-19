// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.5 snapshot fields (proprietary self, not copied)
'use strict';

// ============================================================================
// Octagon Commercial VNext — snapshot-field materialization (T1.5.1, R1.5).
//
// Design (documented in full in ./TASK.md):
//
//   A custom field of type 'snapshot' declares:
//     snapshot_of: { entity, field, ref_field, at_transition_to }
//   meaning: "when THIS record transitions to doc-state `at_transition_to`,
//   copy the current value of `field` from the record referenced by
//   THIS record's own `ref_field` (a foreign key into `entity`) into
//   data.custom[<this field's key>], then freeze it forever."
//
//   Materialization is a COPY into the record's own stored `data` JSON —
//   never a live join/lookup on read. Once frozen it survives any number of
//   later changes to the source record (verified by scripts/test-lane-c-completion.mjs).
//
// Hook points used (both additive, neither edits another lane's file):
//   1. audit.subscribeAudit() (vnext/server/audit/audit.js, owned by this
//      lane) fires for every writeAudit() call app-wide. state/doc-state.js
//      writes `action: "state_transition_<name>"` on every transition — we
//      filter for that and materialize when entry.after.state matches a
//      configured at_transition_to. This is the ONLY way to observe
//      transitions without editing state/doc-state.js (which performs its
//      own direct x_records UPDATE, bypassing crud-engine.js entirely — see
//      TASK.md "why not crud-engine.subscribe" for the trace that proves it).
//   2. crud-engine.js's pre-existing `engine.subscribe(fn)` write-hook (the
//      same mechanism chatter.js's subscribeCrudChatter uses) — used here
//      only for the best-effort post-write immutability guard, since that
//      IS a normal 'update' action and DOES flow through crud-engine.
//      Passing a crudEngine is optional; if omitted the guard is skipped
//      (materialization still works).
// ============================================================================

const { writeAudit, subscribeAudit } = require('../audit/audit');

// Defense in depth: this project's global invariant is "never touch
// payroll/timesheet/attendance/employee" — mirrors chatter.js's
// FROZEN_ENTITY_RE so snapshot materialization/guard never runs against
// those entities even if a stray custom field were ever configured there.
const FROZEN_ENTITY_RE = /(employee|timesheet|attendance|payroll)/i;

function safeJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function hasOwn(obj, key) {
  return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Load all snapshot-type custom field definitions for an entity.
 * @param {object} db sqlite handle
 * @param {string} entity
 * @returns {Array<{entity:string, key:string, label_ar:string, snapshot_of:{entity:string,field:string,ref_field:string,at_transition_to:string}}>}
 */
function loadSnapshotFieldDefs(db, entity) {
  const rows = db
    .prepare("SELECT entity, key, label_ar, snapshot_of FROM x_custom_fields WHERE entity = ? AND type = 'snapshot'")
    .all(entity);
  return rows
    .map((row) => ({ entity: row.entity, key: row.key, label_ar: row.label_ar, snapshot_of: safeJson(row.snapshot_of, null) }))
    .filter((def) => def.snapshot_of && def.snapshot_of.entity && def.snapshot_of.field && def.snapshot_of.ref_field);
}

function readRecordData(db, entity, id) {
  const row = db.prepare('SELECT data FROM x_records WHERE entity = ? AND id = ?').get(entity, id);
  if (!row) return null;
  return safeJson(row.data, {});
}

/**
 * Resolve the current value of `snapshotOf.field` on the record referenced
 * by `refValue` (an id in `snapshotOf.entity`). Returns `undefined` when the
 * reference or the field cannot be resolved (caller must treat that as
 * "materialization skipped", never as a frozen empty value).
 */
function resolveSourceValue(db, snapshotOf, refValue) {
  if (refValue == null || refValue === '') return undefined;
  const sourceRow = db.prepare('SELECT data FROM x_records WHERE entity = ? AND id = ?').get(snapshotOf.entity, String(refValue));
  if (!sourceRow) return undefined;
  const sourceData = safeJson(sourceRow.data, {});
  if (hasOwn(sourceData, snapshotOf.field)) return sourceData[snapshotOf.field];
  if (hasOwn(sourceData.custom, snapshotOf.field)) return sourceData.custom[snapshotOf.field];
  return undefined;
}

function isFrozen(data, key) {
  return !!data && data.__frozen_values__ && typeof data.__frozen_values__ === 'object' && hasOwn(data.__frozen_values__, key);
}

/**
 * Materialize one snapshot field on one record, if not already frozen.
 * Idempotent: once `__frozen_values__[key]` exists, later calls (e.g. a
 * second pass through the same transition after a reversal/re-post cycle)
 * are no-ops — the roadmap invariant is "materialized once, then immutable",
 * not "re-materialized on every visit to the state".
 * @returns {{materialized:boolean, skipped?:boolean, reason?:string, key?:string, value?:*}}
 */
function materializeOne(db, def, entity, recordId, actorUser) {
  const data = readRecordData(db, entity, recordId);
  if (!data) return { materialized: false, skipped: true, reason: 'record_not_found' };
  if (isFrozen(data, def.key)) return { materialized: false, skipped: true, reason: 'already_frozen' };

  const refValue = hasOwn(data, def.snapshot_of.ref_field) ? data[def.snapshot_of.ref_field] : (data.custom && data.custom[def.snapshot_of.ref_field]);
  const sourceValue = resolveSourceValue(db, def.snapshot_of, refValue);
  if (sourceValue === undefined) return { materialized: false, skipped: true, reason: 'source_unresolved' };

  const nextData = { ...data, custom: { ...(data.custom || {}), [def.key]: sourceValue } };
  nextData.__frozen_values__ = { ...(data.__frozen_values__ || {}), [def.key]: sourceValue };

  db.prepare('UPDATE x_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ?')
    .run(JSON.stringify(nextData), new Date().toISOString(), entity, recordId);

  writeAudit(db, {
    entity,
    recordId,
    user: actorUser || 'system',
    action: 'snapshot_materialize',
    before: { [def.key]: null },
    after: { [def.key]: sourceValue, _snapshot_of: def.snapshot_of },
  });

  return { materialized: true, key: def.key, value: sourceValue };
}

/**
 * Subscribe to the audit event bus and materialize matching snapshot fields
 * whenever a `state_transition_*` audit entry lands on a target state that a
 * snapshot field is configured for.
 * @returns {() => void} unsubscribe function
 */
function wireSnapshotMaterialization(db) {
  return subscribeAudit((entry) => {
    if (!entry || typeof entry.action !== 'string' || !entry.action.startsWith('state_transition_')) return;
    if (!entry.after || typeof entry.after !== 'object' || !entry.after.state) return;
    const entity = entry.entity;
    if (FROZEN_ENTITY_RE.test(entity)) return;

    let defs;
    try {
      defs = loadSnapshotFieldDefs(db, entity);
    } catch (error) {
      console.error('[snapshot-fields] failed to load definitions for', entity, ':', error.message);
      return;
    }
    for (const def of defs) {
      if (def.snapshot_of.at_transition_to !== entry.after.state) continue;
      try {
        materializeOne(db, def, entity, entry.recordId, entry.user);
      } catch (error) {
        console.error(`[snapshot-fields] materialize failed (${entity}/${entry.recordId}/${def.key}):`, error.message);
      }
    }
  });
}

/**
 * Best-effort immutability enforcement: after any normal CRUD update that
 * flows through crud-engine.js (`engine.subscribe`), revert any frozen
 * snapshot value that the update attempted to change back to its materialized
 * value, and audit-log the blocked attempt.
 *
 * KNOWN LIMITATION (documented in INTEGRATION.md): this runs AFTER the write
 * has already committed and AFTER the HTTP response for that request has
 * already been prepared, so the single response to the offending PATCH may
 * still echo the rejected value; a subsequent read reflects the reverted,
 * frozen value. A true pre-write 403 requires a hook inside crud-engine.js's
 * updateRecord()/checkForbiddenWrites() path, which this lane does not own
 * and does not edit (see INTEGRATION.md "known gap").
 * @returns {(() => void)|null} unsubscribe function, or null if no crudEngine was provided
 */
function wireImmutabilityGuard(db, crudEngine) {
  if (!crudEngine || typeof crudEngine.subscribe !== 'function') return null;
  return crudEngine.subscribe((entity, action, record) => {
    if (action !== 'update' || !record) return;
    if (FROZEN_ENTITY_RE.test(entity)) return;
    const frozen = record.__frozen_values__;
    if (!frozen || typeof frozen !== 'object') return;
    const custom = record.custom && typeof record.custom === 'object' ? record.custom : {};
    const violated = Object.keys(frozen).filter((key) => JSON.stringify(custom[key]) !== JSON.stringify(frozen[key]));
    if (!violated.length) return;

    try {
      const row = db.prepare('SELECT data FROM x_records WHERE entity = ? AND id = ?').get(entity, record.id);
      if (!row) return;
      const data = safeJson(row.data, {});
      data.custom = { ...(data.custom || {}) };
      const attempted = {};
      violated.forEach((key) => { attempted[key] = data.custom[key]; data.custom[key] = frozen[key]; });
      db.prepare('UPDATE x_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ?')
        .run(JSON.stringify(data), new Date().toISOString(), entity, record.id);
      writeAudit(db, {
        entity,
        recordId: record.id,
        user: 'system',
        action: 'snapshot_write_blocked',
        before: attempted,
        after: Object.fromEntries(violated.map((key) => [key, frozen[key]])),
      });
    } catch (error) {
      console.error(`[snapshot-fields] immutability guard failed (${entity}/${record.id}):`, error.message);
    }
  });
}

/**
 * Wire the snapshot-field module into a running server.
 * @param {{db:object, crudEngine?:{subscribe:Function}}} deps
 */
function createSnapshotFieldsModule(deps) {
  const db = deps && deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new Error('createSnapshotFieldsModule requires a SQLite db handle');
  }
  const unsubscribeAudit = wireSnapshotMaterialization(db);
  const unsubscribeGuard = wireImmutabilityGuard(db, deps.crudEngine);

  return {
    dispose() {
      if (typeof unsubscribeAudit === 'function') unsubscribeAudit();
      if (typeof unsubscribeGuard === 'function') unsubscribeGuard();
    },
    _internal: { materializeOne, loadSnapshotFieldDefs, resolveSourceValue, isFrozen, wireImmutabilityGuard },
  };
}

module.exports = { createSnapshotFieldsModule };
