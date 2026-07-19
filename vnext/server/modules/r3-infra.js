// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// clean-room; true cross-domain R3 infrastructure shared by every R3 domain engine.
// Owns: ids/time/money, company scope, transactions, idempotency, audit+worklist+outbox
// evidence writes, location/product scope guards, and sequence issuance.
// Domain workflow logic must NOT live here.
'use strict';

const crypto = require('node:crypto');
const { writeAudit, getHistory } = require('../audit/audit');
const { nextSeq } = require('../sequences/sequences');
const approvalContract = require('../approvals/approvals')._internal;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function money(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function asDate(value, fallback = new Date().toISOString().slice(0, 10)) { return String(value || fallback).slice(0, 10); }
function within(row, date) { return (!row.valid_from || row.valid_from <= date) && (!row.valid_to || row.valid_to >= date); }

function fail(message, statusCode = 400, code = 'R3_VALIDATION') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function ensureCompany(db, companyId) {
  if (!db.prepare('SELECT 1 FROM companies WHERE company_id=?').get(companyId)) {
    throw fail('company scope is invalid', 403, 'COMPANY_SCOPE_DENIED');
  }
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function withImmediateTransaction(db, work) {
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    if (owns) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}
function atomicCommand(fn) { return (...args) => withImmediateTransaction(args[0], () => fn(...args)); }

function idempotencyScope(db, actorId, companyId, operationType, key, payload) {
  if (!key || !tableExists(db, 'r3_idempotency')) return null;
  const tenantId = companyId;
  const payloadHash = approvalContract.payloadHash(payload);
  const row = db.prepare('SELECT * FROM r3_idempotency WHERE actor_id=? AND company_id=? AND tenant_id=? AND operation_type=? AND idempotency_key=?')
    .get(String(actorId || 'system'), String(companyId), tenantId, operationType, String(key));
  if (row) {
    if (row.payload_hash !== payloadHash) throw fail('idempotency key was reused with a different payload', 409, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
    return { replay: JSON.parse(row.response_json) };
  }
  return { payloadHash, actorId: String(actorId || 'system'), companyId: String(companyId), tenantId, operationType, key: String(key) };
}
function rememberIdempotency(db, scope, response, statusCode = 200) {
  if (!scope || !scope.payloadHash || !tableExists(db, 'r3_idempotency')) return;
  db.prepare('INSERT INTO r3_idempotency(actor_id,company_id,tenant_id,operation_type,idempotency_key,payload_hash,response_json,status_code,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(scope.actorId, scope.companyId, scope.tenantId, scope.operationType, scope.key, scope.payloadHash, JSON.stringify(response), statusCode, now(), null);
}

function publish(runtime, event) {
  if (runtime && runtime.events && typeof runtime.events.publish === 'function') runtime.events.publish(event);
}

// Mandatory evidence write: audit + optional worklist + outbox event + R4.4
// tracked-field auto-log. Failures here must abort the enclosing transaction,
// never be swallowed. Loaded lazily to avoid a require cycle at module init.
let collaboration = null;
function recordWrite(db, runtime, companyId, entity, recordId, action, userId, before, after, queue = null) {
  writeAudit(db, { entity, recordId, user: userId || 'system', action, before: before || null, after: after || null });
  if (queue) {
    db.prepare('INSERT INTO r3_worklist_item(id,company_id,entity,record_id,queue,assignee_id,state,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id('work'), companyId, entity, recordId, queue, null, 'open', now());
  }
  // R4.4: when a write carries a before+after snapshot, auto-log tracked-field
  // changes to the record's chatter thread (only when the x_chatter table exists).
  if (before && after && tableExists(db, 'x_chatter')) {
    if (!collaboration) collaboration = require('./governance/collaboration');
    collaboration.autoLogTrackedChanges(db, entity, recordId, before, after, userId);
  }
  publish(runtime, { type: `r3.${entity}.${action}`, companyId, userId: userId || 'system', audience: { kind: 'company' }, payload: { recordId, action } });
}

function location(db, companyId, type, requested) {
  const row = requested
    ? db.prepare('SELECT * FROM locations WHERE location_id=? AND company_id=?').get(requested, companyId)
    : db.prepare('SELECT * FROM locations WHERE company_id=? AND type=? ORDER BY location_id LIMIT 1').get(companyId, type);
  if (!row) throw fail(`${type} location is required`, 409, 'LOCATION_REQUIRED');
  return row;
}

function product(db, companyId, productId) {
  const row = db.prepare('SELECT * FROM product_master WHERE id=? AND company_id=? AND active=1').get(productId, companyId);
  if (!row) throw fail('product is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  return row;
}


// Cross-domain approval-override gate (credit override on sales documents,
// three-way-match override on purchase orders).
function approvedOverride(db, companyId, approvalRef, entity, recordId) {
  if (!approvalRef || !tableExists(db, 'x_approvals')) return false;
  return approvalContract.approvalMatches(db, { id: approvalRef, companyId, tenantId: companyId, entity, recordId, action: entity === 'sales_quote' || entity === 'sales_order' ? 'credit_override' : 'three_way_match_override' });
}

function issueNumber(db, key, pattern) { return nextSeq(db, key, `${pattern}-{#####}`).formatted; }

module.exports = {
  id, now, money, asDate, within, fail, ensureCompany, tableExists,
  withImmediateTransaction, atomicCommand,
  idempotencyScope, rememberIdempotency,
  publish, recordWrite, location, product, issueNumber, approvedOverride,
  approvalContract, getHistory,
};
