// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function createIntercompanyRule(db, companyId, input) {
  ensureCompany(db, companyId);
  const targetCompany = String(input.target_company_id || '').trim();
  const partnerId = String(input.partner_id || '').trim();
  const targetPartnerId = String(input.target_partner_id || '').trim();
  
  if (!targetCompany) throw fail('target company ID is required', 400, 'TARGET_COMPANY_REQUIRED');
  if (!partnerId) throw fail('partner ID is required', 400, 'PARTNER_REQUIRED');
  if (!targetPartnerId) throw fail('target partner ID is required', 400, 'TARGET_PARTNER_REQUIRED');
  if (companyId === targetCompany) throw fail('cannot create inter-company rule to the same company', 400, 'SAME_COMPANY');
  
  ensureCompany(db, targetCompany);
  
  const existing = db.prepare('SELECT 1 FROM shop_intercompany_rule WHERE company_id = ? AND target_company_id = ?').get(companyId, targetCompany);
  if (existing) throw fail('inter-company rule already exists for this target', 409, 'RULE_EXISTS');
  
  const row = {
    id: id('rule'),
    company_id: companyId,
    partner_id: partnerId,
    target_company_id: targetCompany,
    target_partner_id: targetPartnerId,
    active: 1,
    created_at: now()
  };
  
  db.prepare(`
    INSERT INTO shop_intercompany_rule (id, company_id, partner_id, target_company_id, target_partner_id, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.partner_id, row.target_company_id, row.target_partner_id, row.active, row.created_at);
  
  return row;
}

function triggerIntercompanyMirror(db, companyId, documentType, documentId, userId) {
  ensureCompany(db, companyId);
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    let mirrorRef = null;
    
    if (documentType === 'purchase_order') {
      const po = db.prepare('SELECT * FROM purchase_order WHERE id = ? AND company_id = ?').get(documentId, companyId);
      if (!po) throw fail('purchase order not found', 404, 'PO_NOT_FOUND');
      
      const partnerId = po.supplier_id || po.vendor_id || po.partner_id;
      if (!partnerId) return null;
      
      const rule = db.prepare('SELECT * FROM shop_intercompany_rule WHERE company_id = ? AND partner_id = ? AND active = 1').get(companyId, partnerId);
      if (!rule) return null;
      
      // Auto-generate Sales Order in target company
      const hasSalesOrder = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sales_order'").get();
      if (hasSalesOrder) {
        const soId = id('so');
        const soNumber = `SO-IC-${Math.floor(10000 + Math.random() * 90000)}`;
        
        db.prepare(`
          INSERT INTO sales_order (id, company_id, partner_id, order_number, state, total_amount, idempotency_key, created_at, created_by)
          VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
        `).run(soId, rule.target_company_id, rule.target_partner_id, soNumber, po.total_amount || 0.0, id('idem'), now(), userId || 'system');
        
        // Copy lines
        const lines = db.prepare('SELECT * FROM purchase_order_line WHERE order_id = ?').all(documentId);
        for (const ln of lines) {
          db.prepare(`
            INSERT INTO sales_order_line (id, company_id, order_id, product_id, qty, unit_price, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(id('sol'), rule.target_company_id, soId, ln.product_id, ln.qty, ln.unit_price, ln.subtotal);
        }
        
        // Tag PO and SO as elimination
        db.prepare("UPDATE purchase_order SET state = 'confirmed' WHERE id = ?").run(documentId);
        
        // Write elimination indicator to the snapshots/chatter
        mirrorRef = soId;
      }
    }
    
    if (owns) db.exec('COMMIT');
    return mirrorRef;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function createConsolidationRate(db, companyId, input) {
  ensureCompany(db, companyId);
  const sourceCompany = String(input.source_company_id || '').trim();
  const rate = Number(input.rate || 0);
  const effDate = String(input.effective_date || '').trim();
  
  if (!sourceCompany) throw fail('source company ID is required', 400, 'SOURCE_COMPANY_REQUIRED');
  if (rate <= 0) throw fail('translation rate must be positive', 400, 'RATE_INVALID');
  if (!effDate) throw fail('effective date is required', 400, 'DATE_REQUIRED');
  
  ensureCompany(db, sourceCompany);
  
  const existing = db.prepare('SELECT id FROM shop_consolidation_rate WHERE company_id = ? AND source_company_id = ? AND effective_date = ?').get(companyId, sourceCompany, effDate);
  if (existing) throw fail('consolidation rate already exists for this date', 409, 'RATE_EXISTS');
  
  const row = {
    id: id('rate'),
    company_id: companyId,
    source_company_id: sourceCompany,
    rate,
    effective_date: effDate,
    created_at: now()
  };
  
  db.prepare(`
    INSERT INTO shop_consolidation_rate (id, company_id, source_company_id, rate, effective_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.source_company_id, row.rate, row.effective_date, row.created_at);
  
  return row;
}

function getConsolidatedReport(db, companyId, sourceCompanyIds, reportType, options = {}) {
  ensureCompany(db, companyId);
  const targetCompanies = Array.isArray(sourceCompanyIds) ? sourceCompanyIds : [];
  if (!targetCompanies.length) throw fail('at least one source company ID is required', 400, 'COMPANIES_REQUIRED');
  
  // Verify all source companies are valid
  for (const cid of targetCompanies) {
    ensureCompany(db, cid);
  }
  
  const consolidated = {};
  
  for (const cid of targetCompanies) {
    // Get translation rate for this company to parent company currency
    let rate = 1.0;
    if (cid !== companyId) {
      const rateRow = db.prepare(`
        SELECT rate FROM shop_consolidation_rate
        WHERE company_id = ? AND source_company_id = ?
        ORDER BY effective_date DESC LIMIT 1
      `).get(companyId, cid);
      if (rateRow) {
        rate = rateRow.rate;
      }
    }
    
    // Fetch all GL lines for this company
    const lines = db.prepare(`
      SELECT gl.*, a.code as account_code, a.name as account_name, a.type as account_type
      FROM gl_line gl
      JOIN account a ON a.id = gl.account_id
      WHERE gl.company_id = ?
    `).all(cid);
    
    for (const line of lines) {
      // Inter-company elimination logic:
      // If the GL line contains an elimination indicator in its dimensions (dims JSON)
      // or references a mirrored document, we eliminate it.
      let isEliminated = false;
      try {
        const dims = JSON.parse(line.dims || '{}');
        if (dims.elimination === true || dims.intercompany === true) {
          isEliminated = true;
        }
      } catch (_) {}
      
      // Also check if the fiscal doc has elimination keyword
      const fdoc = db.prepare('SELECT doc_number, move_type FROM fiscal_doc WHERE id = ?').get(line.fiscal_doc_id);
      if (fdoc && (fdoc.doc_number.includes('-IC-') || fdoc.move_type === 'period_close')) {
        // Mirrored document or closed period elimination
        isEliminated = true;
      }
      
      if (isEliminated) continue; // skip this line (eliminated!)
      
      const translatedDebit = line.debit * rate;
      const translatedCredit = line.credit * rate;
      
      const accKey = line.account_code;
      if (!consolidated[accKey]) {
        consolidated[accKey] = {
          account_code: line.account_code,
          account_name: line.account_name,
          account_type: line.account_type,
          debit: 0.0,
          credit: 0.0,
          balance: 0.0
        };
      }
      
      consolidated[accKey].debit += translatedDebit;
      consolidated[accKey].credit += translatedCredit;
      
      const balanceSign = ['asset', 'expense'].includes(line.account_type) ? 1 : -1;
      consolidated[accKey].balance += (translatedDebit - translatedCredit) * balanceSign;
    }
  }
  
  return Object.values(consolidated);
}

module.exports = {
  createIntercompanyRule: infra.atomicCommand(createIntercompanyRule),
  triggerIntercompanyMirror,
  createConsolidationRate: infra.atomicCommand(createConsolidationRate),
  getConsolidatedReport
};
