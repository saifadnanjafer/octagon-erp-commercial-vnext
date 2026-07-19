// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function createQualityTemplate(db, companyId, input) {
  ensureCompany(db, companyId);
  const row = {
    id: id('qt'),
    company_id: companyId,
    name: String(input.name || '').trim(),
    product_id: input.product_id ? String(input.product_id).trim() : null,
    parameters: JSON.stringify(Array.isArray(input.parameters) ? input.parameters : []),
    created_at: now()
  };
  
  if (!row.name) throw fail('quality template name is required', 400, 'NAME_REQUIRED');
  
  db.prepare(`
    INSERT INTO shop_quality_template (id, company_id, name, product_id, parameters, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.name, row.product_id, row.parameters, row.created_at);
  
  return row;
}

function createInspection(db, companyId, input) {
  ensureCompany(db, companyId);
  const row = {
    id: id('insp'),
    company_id: companyId,
    template_id: input.template_id ? String(input.template_id).trim() : null,
    product_id: String(input.product_id || '').trim(),
    source_type: String(input.source_type || 'receipt').trim(),
    source_ref: String(input.source_ref || '').trim(),
    status: 'pending',
    measured_values: null,
    inspected_by: null,
    inspected_at: null
  };
  
  if (!row.product_id) throw fail('product ID is required', 400, 'PRODUCT_REQUIRED');
  if (!['receipt', 'work_order', 'delivery'].includes(row.source_type)) {
    throw fail('invalid source type for quality inspection', 400, 'SOURCE_TYPE_INVALID');
  }
  if (!row.source_ref) throw fail('source reference is required', 400, 'SOURCE_REF_REQUIRED');
  
  db.prepare(`
    INSERT INTO shop_quality_inspection (id, company_id, template_id, product_id, source_type, source_ref, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.template_id, row.product_id, row.source_type, row.source_ref, row.status);
  
  return row;
}

function recordInspectionResult(db, companyId, inspectionId, status, measuredValues, userId) {
  ensureCompany(db, companyId);
  if (!['passed', 'failed'].includes(status)) {
    throw fail('invalid inspection status', 400, 'STATUS_INVALID');
  }
  
  const insp = db.prepare('SELECT * FROM shop_quality_inspection WHERE id = ? AND company_id = ?').get(inspectionId, companyId);
  if (!insp) throw fail('inspection not found', 404, 'INSPECTION_NOT_FOUND');
  if (insp.status !== 'pending') throw fail('inspection result already recorded', 409, 'INSPECTION_CLOSED');
  
  const valuesStr = JSON.stringify(measuredValues || {});
  const inspector = userId || 'inspector';
  const inspectTime = now();
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    db.prepare(`
      UPDATE shop_quality_inspection
      SET status = ?, measured_values = ?, inspected_by = ?, inspected_at = ?
      WHERE id = ?
    `).run(status, valuesStr, inspector, inspectTime, inspectionId);
    
    let ncr = null;
    
    if (status === 'failed') {
      // 1. Create NCR
      const ncrId = id('ncr');
      ncr = {
        id: ncrId,
        company_id: companyId,
        inspection_id: inspectionId,
        description: `Quality inspection failed for product ${insp.product_id} from ${insp.source_type} ${insp.source_ref}`,
        containment_action: null,
        root_cause: null,
        corrective_action: null,
        verification_notes: null,
        state: 'open',
        created_at: now(),
        resolved_at: null
      };
      
      db.prepare(`
        INSERT INTO shop_ncr (id, company_id, inspection_id, description, state, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(ncr.id, ncr.company_id, ncr.inspection_id, ncr.description, ncr.state, ncr.created_at);
      
      // 2. Quarantine stock if possible
      const hasStockMove = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_move'").get();
      if (hasStockMove) {
        // Quarantine to loss or virtual location
        const loc = db.prepare("SELECT location_id FROM locations WHERE company_id = ? AND type = 'internal' LIMIT 1").get(companyId);
        const quarantineLoc = db.prepare("SELECT location_id FROM locations WHERE company_id = ? AND type = 'inventory_loss' LIMIT 1").get(companyId);
        if (loc && quarantineLoc) {
          db.prepare(`
            INSERT INTO stock_move (id, company_id, product_id, qty, uom, from_location_id, to_location_id, state, posting_date, created_at, updated_at)
            VALUES (?, ?, ?, 1.0, 'units', ?, ?, 'done', ?, ?, ?)
          `).run(id('sm'), companyId, insp.product_id, loc.location_id, quarantineLoc.location_id, now(), now(), now());
        }
      }
    }
    
    if (owns) db.exec('COMMIT');
    return { inspection_id: inspectionId, status, ncr };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function updateNcrWorkflow(db, companyId, ncrId, state, input) {
  ensureCompany(db, companyId);
  const ncr = db.prepare('SELECT * FROM shop_ncr WHERE id = ? AND company_id = ?').get(ncrId, companyId);
  if (!ncr) throw fail('NCR not found', 404, 'NCR_NOT_FOUND');
  if (ncr.state === 'verified') throw fail('NCR already closed and verified', 409, 'NCR_CLOSED');
  
  if (!['contained', 'verified'].includes(state)) {
    throw fail('invalid NCR state', 400, 'STATE_INVALID');
  }
  
  const containment = input.containment_action !== undefined ? String(input.containment_action).trim() : ncr.containment_action;
  const cause = input.root_cause !== undefined ? String(input.root_cause).trim() : ncr.root_cause;
  const corrective = input.corrective_action !== undefined ? String(input.corrective_action).trim() : ncr.corrective_action;
  const notes = input.verification_notes !== undefined ? String(input.verification_notes).trim() : ncr.verification_notes;
  const resolvedAt = state === 'verified' ? now() : ncr.resolved_at;
  
  db.prepare(`
    UPDATE shop_ncr
    SET state = ?, containment_action = ?, root_cause = ?, corrective_action = ?, verification_notes = ?, resolved_at = ?
    WHERE id = ?
  `).run(state, containment, cause, corrective, notes, resolvedAt, ncrId);
  
  return db.prepare('SELECT * FROM shop_ncr WHERE id = ?').get(ncrId);
}

function getDefectParetoReport(db, companyId) {
  ensureCompany(db, companyId);
  // Group NCR failures by description or root_cause to analyze common issues
  const rows = db.prepare(`
    SELECT COALESCE(root_cause, 'Unassigned') as cause, COUNT(*) as occurrence_count
    FROM shop_ncr
    WHERE company_id = ?
    GROUP BY cause
    ORDER BY occurrence_count DESC
  `).all(companyId);
  
  const total = rows.reduce((sum, row) => sum + row.occurrence_count, 0);
  let cumulative = 0;
  
  return rows.map(row => {
    cumulative += row.occurrence_count;
    return {
      cause: row.cause,
      count: row.occurrence_count,
      percentage: total > 0 ? (row.occurrence_count / total) * 100 : 0,
      cumulative_percentage: total > 0 ? (cumulative / total) * 100 : 0
    };
  });
}

module.exports = {
  createQualityTemplate: infra.atomicCommand(createQualityTemplate),
  createInspection: infra.atomicCommand(createInspection),
  recordInspectionResult,
  updateNcrWorkflow: infra.atomicCommand(updateNcrWorkflow),
  getDefectParetoReport
};
