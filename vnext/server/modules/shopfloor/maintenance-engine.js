// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');
const arap = require('../../finance/arap-engine');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function generateStraightLine(purchaseVal, salvageVal, months) {
  const schedule = [];
  const depreciableAmount = purchaseVal - salvageVal;
  const monthlyAmount = Number((depreciableAmount / months).toFixed(4));
  
  let cumulative = 0;
  let bookVal = purchaseVal;
  
  for (let i = 1; i <= months; i++) {
    let amount = monthlyAmount;
    if (i === months) {
      amount = Number((depreciableAmount - cumulative).toFixed(4)); // final adjustment to reconcile exact rounding
    }
    cumulative = Number((cumulative + amount).toFixed(4));
    bookVal = Number((purchaseVal - cumulative).toFixed(4));
    
    // date offset by months
    const deprDate = new Date();
    deprDate.setMonth(deprDate.getMonth() + i);
    
    schedule.push({
      sequence: i,
      depreciation_date: deprDate.toISOString().split('T')[0] + 'T00:00:00Z',
      amount,
      cumulative_depreciation: cumulative,
      book_value: bookVal
    });
  }
  return schedule;
}

function generateDoubleDeclining(purchaseVal, salvageVal, months) {
  const schedule = [];
  const rate = 2 / months;
  let bookVal = purchaseVal;
  let cumulative = 0;
  
  for (let i = 1; i <= months; i++) {
    let amount = Number((bookVal * rate).toFixed(4));
    
    // Ensure we do not depreciate below salvage value
    if (bookVal - amount < salvageVal || i === months) {
      amount = Number((bookVal - salvageVal).toFixed(4));
    }
    
    cumulative = Number((cumulative + amount).toFixed(4));
    bookVal = Number((purchaseVal - cumulative).toFixed(4));
    
    const deprDate = new Date();
    deprDate.setMonth(deprDate.getMonth() + i);
    
    schedule.push({
      sequence: i,
      depreciation_date: deprDate.toISOString().split('T')[0] + 'T00:00:00Z',
      amount,
      cumulative_depreciation: cumulative,
      book_value: bookVal
    });
  }
  return schedule;
}

function createAsset(db, companyId, input) {
  ensureCompany(db, companyId);
  const row = {
    id: id('asset'),
    company_id: companyId,
    name: String(input.name || '').trim(),
    code: String(input.code || '').trim(),
    purchase_value: Number(input.purchase_value || 0),
    salvage_value: Number(input.salvage_value || 0),
    useful_life_months: Number(input.useful_life_months || 1),
    depreciation_method: String(input.depreciation_method || 'straight_line').trim(),
    purchase_date: String(input.purchase_date || now()).trim(),
    warranty_expiry_date: input.warranty_expiry_date ? String(input.warranty_expiry_date).trim() : null,
    created_at: now()
  };
  
  if (!row.name) throw fail('asset name is required', 400, 'NAME_REQUIRED');
  if (!row.code) throw fail('asset code is required', 400, 'CODE_REQUIRED');
  if (row.purchase_value <= 0) throw fail('purchase value must be positive', 400, 'VALUE_INVALID');
  if (row.salvage_value < 0 || row.salvage_value >= row.purchase_value) {
    throw fail('salvage value must be non-negative and less than purchase value', 400, 'SALVAGE_INVALID');
  }
  if (row.useful_life_months <= 0) throw fail('useful life months must be positive', 400, 'LIFE_INVALID');
  if (!['straight_line', 'double_declining'].includes(row.depreciation_method)) {
    throw fail('invalid depreciation method', 400, 'METHOD_INVALID');
  }
  
  const existing = db.prepare('SELECT 1 FROM shop_asset WHERE code = ? AND company_id = ?').get(row.code, companyId);
  if (existing) throw fail('asset code already exists', 409, 'CODE_EXISTS');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    db.prepare(`
      INSERT INTO shop_asset (id, company_id, name, code, purchase_value, salvage_value, useful_life_months, depreciation_method, purchase_date, warranty_expiry_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.company_id, row.name, row.code, row.purchase_value, row.salvage_value, row.useful_life_months, row.depreciation_method, row.purchase_date, row.warranty_expiry_date, row.created_at);
    
    // Generate schedules
    const lines = row.depreciation_method === 'double_declining' 
      ? generateDoubleDeclining(row.purchase_value, row.salvage_value, row.useful_life_months)
      : generateStraightLine(row.purchase_value, row.salvage_value, row.useful_life_months);
      
    for (const ln of lines) {
      db.prepare(`
        INSERT INTO shop_asset_depreciation_line (id, company_id, asset_id, sequence, depreciation_date, amount, cumulative_depreciation, book_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id('al'), companyId, row.id, ln.sequence, ln.depreciation_date, ln.amount, ln.cumulative_depreciation, ln.book_value, now());
    }
    
    if (owns) db.exec('COMMIT');
    return row;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function postDepreciationLine(db, companyId, lineId, userId) {
  ensureCompany(db, companyId);
  const line = db.prepare('SELECT * FROM shop_asset_depreciation_line WHERE id = ? AND company_id = ?').get(lineId, companyId);
  if (!line) throw fail('depreciation line not found', 404, 'LINE_NOT_FOUND');
  if (line.posted_entry_id) throw fail('depreciation line already posted', 409, 'LINE_POSTED');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    // Generate Balanced General Ledger posting:
    // Debit: coa_502000 (General Expenses)
    // Credit: coa_104000 (Stock Valuation / Accumulated Depreciation)
    const docId = id('fdoc');
    const docNumber = `JE-DEP-${Math.floor(10000 + Math.random() * 90000)}`;
    
    db.prepare(`
      INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, post_date, state, created_at, created_by)
      VALUES (?, ?, ?, 'manual_entry', ?, ?, 'posted', ?, ?)
    `).run(docId, companyId, docNumber, now().split('T')[0], now(), now(), userId || 'system');
    
    const debitLineId = id('fline');
    const creditLineId = id('fline');
    
    db.prepare(`
      INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
      VALUES (?, ?, ?, 'coa_502000', ?, 0.0, ?)
    `).run(debitLineId, docId, companyId, line.amount, now());
    
    db.prepare(`
      INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
      VALUES (?, ?, ?, 'coa_104000', 0.0, ?, ?)
    `).run(creditLineId, docId, companyId, line.amount, now());
    
    // Write append-only GL lines
    db.prepare(`
      INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, created_at)
      VALUES (?, ?, ?, ?, 'coa_502000', ?, ?, 0.0, ?)
    `).run(id('gl'), companyId, docId, debitLineId, now(), line.amount, now());
    
    db.prepare(`
      INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, created_at)
      VALUES (?, ?, ?, ?, 'coa_104000', ?, 0.0, ?, ?)
    `).run(id('gl'), companyId, docId, creditLineId, now(), line.amount, now());
    
    db.prepare('UPDATE shop_asset_depreciation_line SET posted_entry_id = ? WHERE id = ?').run(docId, lineId);
    
    if (owns) db.exec('COMMIT');
    return { line_id: lineId, posted_entry_id: docId };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function createMaintenanceOrder(db, companyId, input) {
  ensureCompany(db, companyId);
  const row = {
    id: id('maint'),
    company_id: companyId,
    asset_id: input.asset_id ? String(input.asset_id).trim() : null,
    type: String(input.type || 'preventive').trim(),
    description: String(input.description || '').trim(),
    state: 'draft',
    scheduled_date: input.scheduled_date ? String(input.scheduled_date).trim() : null,
    completed_at: null,
    completed_by: null,
    failure_reason: null,
    created_at: now()
  };
  
  if (!row.description) throw fail('maintenance description is required', 400, 'DESCRIPTION_REQUIRED');
  if (!['preventive', 'corrective'].includes(row.type)) {
    throw fail('invalid maintenance type', 400, 'TYPE_INVALID');
  }
  
  db.prepare(`
    INSERT INTO shop_maintenance_order (id, company_id, asset_id, type, description, state, scheduled_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.asset_id, row.type, row.description, row.state, row.scheduled_date, row.created_at);
  
  return row;
}

function completeMaintenanceOrder(db, companyId, maintOrderId, input, userId) {
  ensureCompany(db, companyId);
  const mo = db.prepare('SELECT * FROM shop_maintenance_order WHERE id = ? AND company_id = ?').get(maintOrderId, companyId);
  if (!mo) throw fail('maintenance order not found', 404, 'ORDER_NOT_FOUND');
  if (mo.state === 'completed' || mo.state === 'cancelled') {
    throw fail('maintenance order already completed or cancelled', 409, 'STATE_CLOSED');
  }
  
  const compTime = now();
  const operator = userId || 'maintenance_technician';
  const reason = input.failure_reason ? String(input.failure_reason).trim() : null;
  
  db.prepare(`
    UPDATE shop_maintenance_order
    SET state = 'completed', completed_at = ?, completed_by = ?, failure_reason = ?
    WHERE id = ?
  `).run(compTime, operator, reason, maintOrderId);
  
  return db.prepare('SELECT * FROM shop_maintenance_order WHERE id = ?').get(maintOrderId);
}

function computeMtbf(db, companyId, assetId) {
  ensureCompany(db, companyId);
  const asset = db.prepare('SELECT * FROM shop_asset WHERE id = ? AND company_id = ?').get(assetId, companyId);
  if (!asset) throw fail('asset not found', 404, 'ASSET_NOT_FOUND');
  
  // Operating time = (Time between purchase date and now)
  const purchaseTime = new Date(asset.purchase_date);
  const totalLifeSec = Math.max(0, Math.floor((new Date() - purchaseTime) / 1000));
  
  // Total failures = count of completed corrective maintenance orders
  const failRow = db.prepare(`
    SELECT COUNT(*) as failure_count
    FROM shop_maintenance_order
    WHERE company_id = ? AND asset_id = ? AND type = 'corrective' AND state = 'completed'
  `).get(companyId, assetId);
  
  const failures = failRow.failure_count;
  const mtbfSec = failures > 0 ? totalLifeSec / failures : totalLifeSec;
  
  return {
    asset_id: assetId,
    total_life_seconds: totalLifeSec,
    failure_count: failures,
    mtbf_hours: Number((mtbfSec / 3600).toFixed(2))
  };
}

module.exports = {
  createAsset: infra.atomicCommand(createAsset),
  postDepreciationLine,
  createMaintenanceOrder: infra.atomicCommand(createMaintenanceOrder),
  completeMaintenanceOrder: infra.atomicCommand(completeMaintenanceOrder),
  computeMtbf
};
