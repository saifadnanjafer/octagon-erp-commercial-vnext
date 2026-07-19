// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function createOperator(db, companyId, input) {
  ensureCompany(db, companyId);
  const pin = String(input.badge_pin || '').trim();
  if (!pin) throw fail('badge PIN is required', 400, 'PIN_REQUIRED');
  
  const existing = db.prepare('SELECT 1 FROM shop_operator WHERE badge_pin = ? AND company_id = ?').get(pin, companyId);
  if (existing) throw fail('badge PIN already registered', 409, 'PIN_EXISTS');
  
  const row = {
    id: String(input.id || id('op')),
    company_id: companyId,
    name: String(input.name || '').trim(),
    badge_pin: pin,
    active: 1,
    created_at: now()
  };
  
  if (!row.name) throw fail('operator name is required', 400, 'NAME_REQUIRED');
  
  db.prepare(`
    INSERT INTO shop_operator (id, company_id, name, badge_pin, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.name, row.badge_pin, row.active, row.created_at);
  
  return row;
}

function loginOperator(db, companyId, badgePin) {
  ensureCompany(db, companyId);
  const pin = String(badgePin || '').trim();
  if (!pin) throw fail('PIN is required', 400, 'PIN_REQUIRED');
  
  const row = db.prepare('SELECT * FROM shop_operator WHERE badge_pin = ? AND company_id = ? AND active = 1').get(pin, companyId);
  if (!row) throw fail('invalid badge PIN or operator inactive', 401, 'INVALID_PIN');
  return row;
}

function logWorkOrderAction(db, companyId, operatorId, workOrderId, action, qtyProduced, qtyScrapped, userId) {
  ensureCompany(db, companyId);
  if (!['start', 'pause', 'finish'].includes(action)) {
    throw fail('invalid shop floor action', 400, 'ACTION_INVALID');
  }
  
  const operator = db.prepare('SELECT 1 FROM shop_operator WHERE id = ? AND company_id = ? AND active = 1').get(operatorId, companyId);
  if (!operator) throw fail('operator not found', 404, 'OPERATOR_NOT_FOUND');
  
  const wo = db.prepare('SELECT * FROM mrp_work_order WHERE id = ? AND company_id = ?').get(workOrderId, companyId);
  if (!wo) throw fail('work order not found', 404, 'WORK_ORDER_NOT_FOUND');
  if (wo.state === 'cancelled' || wo.state === 'completed') {
    throw fail('cannot log action on inactive work order', 409, 'WORK_ORDER_INACTIVE');
  }
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    let nextState = wo.state;
    if (action === 'start') {
      nextState = 'running';
    } else if (action === 'finish') {
      nextState = 'completed';
    } else if (action === 'pause') {
      nextState = 'paused';
    }
    
    // Update WO state
    db.prepare('UPDATE mrp_work_order SET state = ? WHERE id = ?').run(nextState, workOrderId);
    
    // Log the timesheet/action
    const logId = id('op_log');
    db.prepare(`
      INSERT INTO shop_operator_log (id, company_id, work_order_id, operator_id, action, qty_produced, qty_scrapped, logged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, companyId, workOrderId, operatorId, action, Number(qtyProduced || 0), Number(qtyScrapped || 0), now());
    
    // If scrap is reported, insert into mrp_scrap (R3.5 table) if it exists
    if (Number(qtyScrapped) > 0) {
      const hasScrapTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mrp_scrap'").get();
      if (hasScrapTable) {
        db.prepare(`
          INSERT INTO mrp_scrap (id, company_id, work_order_id, product_id, qty, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id('scrap'), companyId, workOrderId, wo.product_id, Number(qtyScrapped), 'Shop-floor scrap entry', now());
      }
    }
    
    const updatedWo = db.prepare('SELECT * FROM mrp_work_order WHERE id = ?').get(workOrderId);
    recordWrite(db, null, companyId, 'mrp_work_order', workOrderId, `shop_${action}`, userId, wo, updatedWo);
    
    if (owns) db.exec('COMMIT');
    return { work_order: updatedWo, log_id: logId };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function issueMaterial(db, companyId, workOrderId, productId, qty, userId) {
  ensureCompany(db, companyId);
  const q = Number(qty || 0);
  if (q <= 0) throw fail('material issue quantity must be positive', 400, 'QTY_INVALID');
  
  const wo = db.prepare('SELECT 1 FROM mrp_work_order WHERE id = ? AND company_id = ?').get(workOrderId, companyId);
  if (!wo) throw fail('work order not found', 404, 'WORK_ORDER_NOT_FOUND');
  
  const product = db.prepare('SELECT 1 FROM product_master WHERE id = ? AND company_id = ? AND active = 1').get(productId, companyId);
  if (!product) throw fail('active product not found', 404, 'PRODUCT_NOT_FOUND');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const issueId = id('issue');
    db.prepare(`
      INSERT INTO shop_material_issue (id, company_id, work_order_id, product_id, qty, issued_at, issued_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(issueId, companyId, workOrderId, productId, q, now(), userId || 'system');
    
    // Simulate/trigger a stock move consumption in the stock ledger if available
    // R2.5 stock_move table:
    const hasStockMove = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_move'").get();
    if (hasStockMove) {
      // Find a default location (e.g. stock or WIP)
      const loc = db.prepare("SELECT location_id FROM locations WHERE company_id = ? AND type = 'internal' LIMIT 1").get(companyId);
      const wipLoc = db.prepare("SELECT location_id FROM locations WHERE company_id = ? AND type = 'production' LIMIT 1").get(companyId);
      if (loc && wipLoc) {
        db.prepare(`
          INSERT INTO stock_move (id, company_id, product_id, qty, uom, from_location_id, to_location_id, state, posting_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'units', ?, ?, 'done', ?, ?, ?)
        `).run(id('sm'), companyId, productId, q, loc.location_id, wipLoc.location_id, now(), now(), now());
      }
    }
    
    if (owns) db.exec('COMMIT');
    return { issue_id: issueId, work_order_id: workOrderId, product_id: productId, qty: q };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function getWorkOrderTerminalState(db, companyId, workOrderId) {
  ensureCompany(db, companyId);
  const wo = db.prepare('SELECT * FROM mrp_work_order WHERE id = ? AND company_id = ?').get(workOrderId, companyId);
  if (!wo) throw fail('work order not found', 404, 'WORK_ORDER_NOT_FOUND');
  
  const logs = db.prepare('SELECT * FROM shop_operator_log WHERE work_order_id = ?').all(workOrderId);
  const issues = db.prepare(`
    SELECT mi.*, p.name as product_name, p.code as product_code
    FROM shop_material_issue mi
    JOIN product_master p ON p.id = mi.product_id
    WHERE mi.work_order_id = ?
  `).all(workOrderId);
  
  return { work_order: wo, logs, material_issued: issues };
}

module.exports = {
  createOperator: infra.atomicCommand(createOperator),
  loginOperator,
  logWorkOrderAction,
  issueMaterial,
  getWorkOrderTerminalState
};
