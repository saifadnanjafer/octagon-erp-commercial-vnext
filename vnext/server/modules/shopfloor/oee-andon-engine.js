// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function raiseAndonCall(db, companyId, workOrderId, operatorId, reason, description) {
  ensureCompany(db, companyId);
  const row = {
    id: id('andon'),
    company_id: companyId,
    work_order_id: workOrderId || null,
    operator_id: operatorId || null,
    reason: String(reason || '').trim(),
    description: description ? String(description).trim() : null,
    state: 'raised',
    raised_at: now(),
    acknowledged_at: null,
    resolved_at: null,
    resolved_by: null,
    response_time_sec: null,
    resolution_time_sec: null
  };
  
  if (!row.reason) throw fail('andon reason is required', 400, 'REASON_REQUIRED');
  
  db.prepare(`
    INSERT INTO shop_andon_call (id, company_id, work_order_id, operator_id, reason, description, state, raised_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.work_order_id, row.operator_id, row.reason, row.description, row.state, row.raised_at);
  
  return row;
}

function acknowledgeAndonCall(db, companyId, andonCallId, operatorId) {
  ensureCompany(db, companyId);
  const call = db.prepare('SELECT * FROM shop_andon_call WHERE id = ? AND company_id = ?').get(andonCallId, companyId);
  if (!call) throw fail('Andon call not found', 404, 'ANDON_NOT_FOUND');
  if (call.state !== 'raised') throw fail('Andon call already acknowledged or resolved', 409, 'ANDON_STATE_INVALID');
  
  const ackTime = now();
  const diffSec = Math.max(0, Math.floor((new Date(ackTime) - new Date(call.raised_at)) / 1000));
  
  db.prepare(`
    UPDATE shop_andon_call
    SET state = 'acknowledged', acknowledged_at = ?, response_time_sec = ?
    WHERE id = ?
  `).run(ackTime, diffSec, andonCallId);
  
  return db.prepare('SELECT * FROM shop_andon_call WHERE id = ?').get(andonCallId);
}

function resolveAndonCall(db, companyId, andonCallId, resolvedBy) {
  ensureCompany(db, companyId);
  const call = db.prepare('SELECT * FROM shop_andon_call WHERE id = ? AND company_id = ?').get(andonCallId, companyId);
  if (!call) throw fail('Andon call not found', 404, 'ANDON_NOT_FOUND');
  if (call.state === 'resolved') throw fail('Andon call already resolved', 409, 'ANDON_STATE_INVALID');
  
  const resTime = now();
  const diffSec = Math.max(0, Math.floor((new Date(resTime) - new Date(call.raised_at)) / 1000));
  
  db.prepare(`
    UPDATE shop_andon_call
    SET state = 'resolved', resolved_at = ?, resolved_by = ?, resolution_time_sec = ?
    WHERE id = ?
  `).run(resTime, resolvedBy || 'supervisor', diffSec, andonCallId);
  
  return db.prepare('SELECT * FROM shop_andon_call WHERE id = ?').get(andonCallId);
}

function logDowntimeStart(db, companyId, workCenterId, reason, type) {
  ensureCompany(db, companyId);
  if (!['planned', 'unplanned'].includes(type)) {
    throw fail('invalid downtime type', 400, 'TYPE_INVALID');
  }
  
  const row = {
    id: id('dt'),
    company_id: companyId,
    work_center_id: String(workCenterId || '').trim(),
    reason: String(reason || '').trim(),
    type,
    start_at: now(),
    end_at: null,
    duration_sec: null
  };
  
  if (!row.work_center_id) throw fail('work center is required', 400, 'WORK_CENTER_REQUIRED');
  if (!row.reason) throw fail('downtime reason is required', 400, 'REASON_REQUIRED');
  
  db.prepare(`
    INSERT INTO shop_downtime (id, company_id, work_center_id, reason, type, start_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.work_center_id, row.reason, row.type, row.start_at);
  
  return row;
}

function logDowntimeEnd(db, companyId, downtimeId) {
  ensureCompany(db, companyId);
  const dt = db.prepare('SELECT * FROM shop_downtime WHERE id = ? AND company_id = ?').get(downtimeId, companyId);
  if (!dt) throw fail('downtime entry not found', 404, 'DOWNTIME_NOT_FOUND');
  if (dt.end_at) throw fail('downtime entry already closed', 409, 'DOWNTIME_CLOSED');
  
  const endTime = now();
  const durationSec = Math.max(0, Math.floor((new Date(endTime) - new Date(dt.start_at)) / 1000));
  
  db.prepare(`
    UPDATE shop_downtime
    SET end_at = ?, duration_sec = ?
    WHERE id = ?
  `).run(endTime, durationSec, downtimeId);
  
  return db.prepare('SELECT * FROM shop_downtime WHERE id = ?').get(downtimeId);
}

function computeOee(db, companyId, workCenterId, totalPlannedTimeSec = 28800) {
  ensureCompany(db, companyId);
  
  // Calculate total unplanned downtime
  const dtRow = db.prepare(`
    SELECT COALESCE(SUM(duration_sec), 0) as unplanned_dt_sec
    FROM shop_downtime
    WHERE company_id = ? AND work_center_id = ? AND type = 'unplanned' AND end_at IS NOT NULL
  `).get(companyId, workCenterId);
  
  const unplannedDt = dtRow.unplanned_dt_sec;
  const runtime = Math.max(0, totalPlannedTimeSec - unplannedDt);
  
  // Calculate Availability
  const availability = totalPlannedTimeSec > 0 ? runtime / totalPlannedTimeSec : 0;
  
  // Calculate production logs: actual qty produced & scrapped
  // In the real system, a work order is assigned to a work center.
  // For simplicity and decoupling, we assume logs have work center references, or we can get logs for work orders.
  // Let's select logs for all work orders
  const prodRow = db.prepare(`
    SELECT COALESCE(SUM(qty_produced), 0) as total_produced,
           COALESCE(SUM(qty_scrapped), 0) as total_scrapped
    FROM shop_operator_log
    WHERE company_id = ?
  `).get(companyId);
  
  const produced = prodRow.total_produced;
  const scrapped = prodRow.total_scrapped;
  const good = Math.max(0, produced - scrapped);
  
  // Performance calculation: actual run time vs ideal cycle time (e.g. 60 seconds per unit produced)
  const idealCycleTimeSec = 60;
  const idealProducedTime = produced * idealCycleTimeSec;
  
  let performance = 0;
  if (runtime > 0) {
    performance = idealProducedTime / runtime;
  }
  if (performance > 1.0) performance = 1.0; // cap at 100%
  
  // Quality calculation: good / total
  const quality = produced > 0 ? good / produced : 1.0;
  
  const oee = availability * performance * quality;
  
  return {
    availability,
    performance,
    quality,
    oee,
    metrics: {
      total_planned_sec: totalPlannedTimeSec,
      unplanned_downtime_sec: unplannedDt,
      actual_runtime_sec: runtime,
      qty_produced: produced,
      qty_scrapped: scrapped,
      qty_good: good
    }
  };
}

module.exports = {
  raiseAndonCall: infra.atomicCommand(raiseAndonCall),
  acknowledgeAndonCall: infra.atomicCommand(acknowledgeAndonCall),
  resolveAndonCall: infra.atomicCommand(resolveAndonCall),
  logDowntimeStart: infra.atomicCommand(logDowntimeStart),
  logDowntimeEnd: infra.atomicCommand(logDowntimeEnd),
  computeOee
};
