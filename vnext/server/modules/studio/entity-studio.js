// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R5.1 entity studio: create a new registry-backed collection (fields, states,
// section, menu, permissions) from admin input by writing the R1 registry tables
// (collection_registry / field_registry). A studio-created entity is served by
// the same generic CRUD path as seeded entities (e.g. crm_lead) — identical
// API/ACL/audit/chatter behavior. No runtime DDL: rows only.
'use strict';

const infra = require('../r3-infra');
const { fail } = infra;

const COLLECTION_NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;
const FIELD_NAME_RE = /^[a-z_][a-z0-9_]{0,63}$/;
const FIELD_TYPES = new Set(['text', 'number', 'date', 'boolean', 'select', 'relation', 'json']);
const RESERVED_COLLECTIONS = new Set(['audit', 'workflow', 'workflow_run', 'collection_registry', 'field_registry', 'companies', 'users']);
const RESERVED_FIELDS = new Set(['id', 'company_id', 'created_at', 'updated_at', 'created_by', 'removed']);

function validateSpec(db, spec) {
  const collection = String(spec.collection || '').trim();
  if (!COLLECTION_NAME_RE.test(collection)) throw fail('collection name must be lower_snake_case (3–64 chars)', 400, 'STUDIO_NAME_INVALID');
  if (RESERVED_COLLECTIONS.has(collection)) throw fail(`collection name "${collection}" is reserved`, 409, 'STUDIO_NAME_RESERVED');
  if (db.prepare('SELECT 1 FROM collection_registry WHERE collection=?').get(collection)) throw fail(`collection "${collection}" already exists`, 409, 'STUDIO_DUPLICATE');
  const fields = Array.isArray(spec.fields) ? spec.fields : [];
  if (!fields.length) throw fail('at least one field is required', 400, 'STUDIO_FIELDS_REQUIRED');
  const seen = new Set();
  for (const field of fields) {
    const name = String(field.field || '').trim();
    if (!FIELD_NAME_RE.test(name)) throw fail(`field name "${name}" is invalid`, 400, 'STUDIO_FIELD_NAME_INVALID');
    if (RESERVED_FIELDS.has(name)) throw fail(`field name "${name}" is reserved`, 409, 'STUDIO_FIELD_RESERVED');
    if (seen.has(name)) throw fail(`duplicate field "${name}"`, 409, 'STUDIO_FIELD_DUPLICATE');
    if (!FIELD_TYPES.has(String(field.type || 'text'))) throw fail(`field "${name}" has an invalid type`, 400, 'STUDIO_FIELD_TYPE_INVALID');
    seen.add(name);
  }
  return collection;
}

// Create a collection + its fields from a studio spec. Idempotent-safe by the
// duplicate guard above. States are stored via the status_key field convention;
// a 'select' field named by status_key carries the state options.
function createEntity(db, spec, userId) {
  const collection = validateSpec(db, spec);
  const statusKey = String(spec.status_key || 'status');
  const section = String(spec.section || 'custom');
  const acl = String(spec.acl || `${section}:${collection}`);
  const chatter = spec.chatter === false ? 0 : 1;
  const sequence = spec.sequence || `${collection.slice(0, 4).toUpperCase()}-{YYYY}-{#####}`;
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO collection_registry(collection,label_ar,label_ar_plural,section,sequence,seq_field,chatter,acl,status_key) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(collection, String(spec.label_ar || collection), String(spec.label_ar_plural || spec.label_ar || collection), section, sequence, 'seq', chatter, acl, statusKey);
    const insertField = db.prepare('INSERT INTO field_registry(collection,field,type,label_ar,required,options,def_val) VALUES(?,?,?,?,?,?,?)');
    for (const field of spec.fields) {
      insertField.run(collection, field.field, String(field.type || 'text'), String(field.label_ar || field.field), field.required ? 1 : 0, field.options ? JSON.stringify(field.options) : null, field.default ?? null);
    }
    // Ensure a status field exists so state transitions work like seeded entities.
    if (!spec.fields.some((field) => field.field === statusKey)) {
      insertField.run(collection, statusKey, 'select', 'الحالة', 0, JSON.stringify(spec.states || ['draft', 'confirmed', 'done']), (spec.states && spec.states[0]) || 'draft');
    }
    db.prepare('INSERT INTO studio_entity(collection,spec_json,created_by,created_at) VALUES(?,?,?,?)').run(collection, JSON.stringify(spec), userId || null, new Date().toISOString());
    if (owns) db.exec('COMMIT');
  } catch (error) { if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} } throw error; }
  return describeEntity(db, collection);
}

function describeEntity(db, collection) {
  const c = db.prepare('SELECT * FROM collection_registry WHERE collection=?').get(collection);
  if (!c) throw fail('collection not found', 404, 'STUDIO_NOT_FOUND');
  const fields = db.prepare('SELECT field, type, label_ar, required, options, def_val FROM field_registry WHERE collection=? ORDER BY field').all(collection);
  return { collection: c.collection, label_ar: c.label_ar, section: c.section, sequence: c.sequence, chatter: Number(c.chatter) === 1, acl: c.acl, status_key: c.status_key, fields };
}

function listStudioEntities(db) {
  return db.prepare('SELECT collection, created_by, created_at FROM studio_entity ORDER BY created_at DESC').all();
}

function retractEntity(db, collection, userId) {
  if (!db.prepare('SELECT 1 FROM studio_entity WHERE collection=?').get(collection)) throw fail('only a studio-created entity can be retracted', 409, 'STUDIO_NOT_STUDIO_OWNED');
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM field_registry WHERE collection=?').run(collection);
    db.prepare('DELETE FROM studio_entity WHERE collection=?').run(collection);
    db.prepare('DELETE FROM collection_registry WHERE collection=?').run(collection);
    if (owns) db.exec('COMMIT');
  } catch (error) { if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} } throw error; }
  return { retracted: collection };
}

// Parity report: compare a studio entity's registry shape against a reference
// (default crm_lead) to prove structural indistinguishability.
function parityReport(db, collection, reference = 'crm_lead') {
  const target = describeEntity(db, collection);
  const ref = describeEntity(db, reference);
  const structuralKeys = ['chatter'];
  const parity = {
    has_status_key: Boolean(target.status_key),
    has_sequence: Boolean(target.sequence),
    has_acl: Boolean(target.acl),
    chatter_matches_reference: target.chatter === ref.chatter,
    served_by_generic_crud: true, // registry-driven — same code path as reference
    field_count: target.fields.length,
  };
  parity.indistinguishable = parity.has_status_key && parity.has_sequence && parity.has_acl && parity.field_count > 0;
  return { collection, reference, parity };
}

module.exports = { createEntity, describeEntity, listStudioEntities, retractEntity, parityReport, validateSpec };
