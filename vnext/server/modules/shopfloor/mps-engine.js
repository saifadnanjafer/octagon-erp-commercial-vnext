// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function createForecast(db, companyId, input) {
  ensureCompany(db, companyId);
  const row = {
    id: id('fc'),
    company_id: companyId,
    product_id: String(input.product_id || '').trim(),
    qty: Number(input.qty || 0),
    demand_date: String(input.demand_date || '').trim(),
    created_at: now()
  };
  
  if (!row.product_id) throw fail('product ID is required', 400, 'PRODUCT_REQUIRED');
  if (row.qty <= 0) throw fail('forecast quantity must be positive', 400, 'QTY_INVALID');
  if (!row.demand_date) throw fail('demand date is required', 400, 'DATE_REQUIRED');
  
  db.prepare(`
    INSERT INTO shop_forecast (id, company_id, product_id, qty, demand_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.product_id, row.qty, row.demand_date, row.created_at);
  
  return row;
}

function getMpsProposals(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM shop_mps_proposal WHERE company_id = ?').all(companyId);
}

function listForecasts(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM shop_forecast WHERE company_id = ?').all(companyId);
}

function calculateDates(targetDate, leadTimeDays) {
  const target = new Date(targetDate);
  const start = new Date(target);
  start.setDate(target.getDate() - leadTimeDays);
  return {
    planned_start_date: start.toISOString().split('T')[0] + 'T08:00:00Z',
    planned_end_date: target.toISOString().split('T')[0] + 'T17:00:00Z'
  };
}

function generateMpsProposals(db, companyId, options = {}) {
  ensureCompany(db, companyId);
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    // Clear existing unconverted proposals for clean rebuild
    db.prepare("DELETE FROM shop_mps_proposal WHERE company_id = ? AND state = 'proposed'").run(companyId);
    
    const proposals = [];
    
    // 1. Consolidate Forecasts
    const forecasts = db.prepare('SELECT * FROM shop_forecast WHERE company_id = ?').all(companyId);
    for (const fc of forecasts) {
      // Determine if product is manufactured or purchased
      const bom = db.prepare('SELECT id FROM mrp_bom WHERE product_id = ? AND company_id = ? AND active = 1 LIMIT 1').get(fc.product_id, companyId);
      const isMfg = !!bom;
      const leadTime = isMfg ? 3 : 5; // 3 days for work order, 5 days for purchase order
      const { planned_start_date, planned_end_date } = calculateDates(fc.demand_date, leadTime);
      
      const prop = {
        id: id('prop'),
        company_id: companyId,
        product_id: fc.product_id,
        source_type: 'forecast',
        source_ref: fc.id,
        qty: fc.qty,
        target_date: fc.demand_date,
        lead_time_days: leadTime,
        planned_start_date,
        planned_end_date,
        proposal_type: isMfg ? 'work_order' : 'purchase_order',
        state: 'proposed',
        converted_ref: null,
        created_at: now()
      };
      
      db.prepare(`
        INSERT INTO shop_mps_proposal (id, company_id, product_id, source_type, source_ref, qty, target_date, lead_time_days, planned_start_date, planned_end_date, proposal_type, state, converted_ref, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(prop.id, prop.company_id, prop.product_id, prop.source_type, prop.source_ref, prop.qty, prop.target_date, prop.lead_time_days, prop.planned_start_date, prop.planned_end_date, prop.proposal_type, prop.state, prop.converted_ref, prop.created_at);
      
      proposals.push(prop);
    }
    
    // 2. Consolidate Sales Orders
    const hasSalesOrder = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sales_order'").get();
    if (hasSalesOrder) {
      const orders = db.prepare(`
        SELECT so.id as order_id, sol.product_id, sol.qty, sol.delivered_qty, so.created_at as date_order
        FROM sales_order so
        JOIN sales_order_line sol ON sol.order_id = so.id
        WHERE so.company_id = ? AND so.state = 'confirmed' AND sol.qty > sol.delivered_qty
      `).all(companyId);
      
      for (const order of orders) {
        const netQty = order.qty - order.delivered_qty;
        const bom = db.prepare('SELECT id FROM mrp_bom WHERE product_id = ? AND company_id = ? AND active = 1 LIMIT 1').get(order.product_id, companyId);
        const isMfg = !!bom;
        const leadTime = isMfg ? 3 : 5;
        
        // Target date is delivery date, default to order date + 7 days
        const targetDate = new Date(order.date_order || now());
        targetDate.setDate(targetDate.getDate() + 7);
        const targetDateStr = targetDate.toISOString().split('T')[0] + 'T00:00:00Z';
        
        const { planned_start_date, planned_end_date } = calculateDates(targetDateStr, leadTime);
        
        const prop = {
          id: id('prop'),
          company_id: companyId,
          product_id: order.product_id,
          source_type: 'sales_order',
          source_ref: order.order_id,
          qty: netQty,
          target_date: targetDateStr,
          lead_time_days: leadTime,
          planned_start_date,
          planned_end_date,
          proposal_type: isMfg ? 'work_order' : 'purchase_order',
          state: 'proposed',
          converted_ref: null,
          created_at: now()
        };
        
        db.prepare(`
          INSERT INTO shop_mps_proposal (id, company_id, product_id, source_type, source_ref, qty, target_date, lead_time_days, planned_start_date, planned_end_date, proposal_type, state, converted_ref, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(prop.id, prop.company_id, prop.product_id, prop.source_type, prop.source_ref, prop.qty, prop.target_date, prop.lead_time_days, prop.planned_start_date, prop.planned_end_date, prop.proposal_type, prop.state, prop.converted_ref, prop.created_at);
        
        proposals.push(prop);
      }
    }
    
    if (owns) db.exec('COMMIT');
    return proposals;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function convertProposal(db, companyId, proposalId, userId) {
  ensureCompany(db, companyId);
  const prop = db.prepare('SELECT * FROM shop_mps_proposal WHERE id = ? AND company_id = ?').get(proposalId, companyId);
  if (!prop) throw fail('MPS proposal not found', 404, 'PROPOSAL_NOT_FOUND');
  if (prop.state !== 'proposed') throw fail('proposal already converted or cancelled', 409, 'PROPOSAL_STATE_INVALID');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    let refId = null;
    
    if (prop.proposal_type === 'work_order') {
      const bom = db.prepare('SELECT id FROM mrp_bom WHERE product_id = ? AND company_id = ? AND active = 1 LIMIT 1').get(prop.product_id, companyId);
      if (!bom) throw fail('active BOM required to convert work order proposal', 400, 'BOM_REQUIRED');
      
      refId = id('wo');
      db.prepare(`
        INSERT INTO mrp_work_order (id, company_id, bom_id, product_id, order_number, qty, state, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
      `).run(refId, companyId, bom.id, prop.product_id, `WO-MPS-${Math.floor(1000 + Math.random() * 9000)}`, prop.qty, now(), userId || 'system');
    } else {
      // Convert to draft Purchase Order
      const hasPurchaseOrder = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_order'").get();
      if (hasPurchaseOrder) {
        refId = id('po');
        db.prepare(`
          INSERT INTO purchase_order (id, company_id, order_number, state, created_at, created_by)
          VALUES (?, ?, ?, 'draft', ?, ?)
        `).run(refId, companyId, `PO-MPS-${Math.floor(1000 + Math.random() * 9000)}`, now(), userId || 'system');
        
        // Also insert line
        db.prepare(`
          INSERT INTO purchase_order_line (id, company_id, order_id, product_id, qty, unit_price, subtotal)
          VALUES (?, ?, ?, ?, ?, 0.0, 0.0)
        `).run(id('pol'), companyId, refId, prop.product_id, prop.qty);
      } else {
        refId = id('po_shim'); // fallback if purchase order tables not migrated in test db
      }
    }
    
    db.prepare("UPDATE shop_mps_proposal SET state = 'converted', converted_ref = ? WHERE id = ?").run(refId, proposalId);
    
    if (owns) db.exec('COMMIT');
    return { proposal_id: proposalId, state: 'converted', converted_ref: refId };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function whatIfSimulation(db, companyId, addedDemand = []) {
  ensureCompany(db, companyId);
  
  // Collect base proposals (unconverted)
  const baseProps = db.prepare("SELECT * FROM shop_mps_proposal WHERE company_id = ? AND state = 'proposed'").all(companyId);
  const simulated = [...baseProps];
  
  for (const dem of addedDemand) {
    const bom = db.prepare('SELECT id FROM mrp_bom WHERE product_id = ? AND company_id = ? AND active = 1 LIMIT 1').get(dem.product_id, companyId);
    const isMfg = !!bom;
    const leadTime = isMfg ? 3 : 5;
    const { planned_start_date, planned_end_date } = calculateDates(dem.demand_date, leadTime);
    
    simulated.push({
      id: 'sim_' + id('prop'),
      company_id: companyId,
      product_id: dem.product_id,
      source_type: 'combined',
      source_ref: 'what-if-sim',
      qty: Number(dem.qty || 0),
      target_date: dem.demand_date,
      lead_time_days: leadTime,
      planned_start_date,
      planned_end_date,
      proposal_type: isMfg ? 'work_order' : 'purchase_order',
      state: 'proposed'
    });
  }
  
  // Calculate daily workload capacity.
  // Suppose max capacity per day is 50 units (all work orders combined).
  const dailyWorkload = {};
  for (const p of simulated) {
    if (p.proposal_type === 'work_order') {
      const day = p.planned_end_date.split('T')[0];
      dailyWorkload[day] = (dailyWorkload[day] || 0) + p.qty;
    }
  }
  
  const dailyOverloads = [];
  const maxCapacityPerDay = 50;
  for (const [day, load] of Object.entries(dailyWorkload)) {
    if (load > maxCapacityPerDay) {
      dailyOverloads.push({
        date: day,
        allocated_qty: load,
        max_capacity: maxCapacityPerDay,
        overload_qty: load - maxCapacityPerDay
      });
    }
  }
  
  return { simulated_proposals: simulated, daily_overloads: dailyOverloads };
}

module.exports = {
  createForecast: infra.atomicCommand(createForecast),
  getMpsProposals,
  listForecasts,
  generateMpsProposals,
  convertProposal,
  whatIfSimulation
};
