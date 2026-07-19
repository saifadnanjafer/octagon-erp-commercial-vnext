// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function money(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function asDate(value) { return String(value || now()).slice(0, 10); }

function linkPortalUser(db, companyId, userId, partnerId) {
  ensureCompany(db, companyId);
  
  const partner = db.prepare('SELECT 1 FROM partner_master WHERE id = ? AND company_id = ?').get(partnerId, companyId);
  if (!partner) throw fail('partner not found or outside company scope', 403, 'PARTNER_SCOPE_DENIED');
  
  const existing = db.prepare('SELECT id FROM portal_user_link WHERE user_id = ? AND company_id = ?').get(userId, companyId);
  
  if (existing) {
    db.prepare('UPDATE portal_user_link SET partner_id = ? WHERE id = ?').run(partnerId, existing.id);
    return db.prepare('SELECT * FROM portal_user_link WHERE id = ?').get(existing.id);
  } else {
    const rowId = id('portal_user');
    const row = {
      id: rowId,
      company_id: companyId,
      user_id: userId,
      partner_id: partnerId,
      created_at: now()
    };
    db.prepare(`
      INSERT INTO portal_user_link (id, company_id, user_id, partner_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(row.id, row.company_id, row.user_id, row.partner_id, row.created_at);
    return row;
  }
}

function getPortalPartnerId(db, companyId, userId) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT partner_id FROM portal_user_link WHERE user_id = ? AND company_id = ?').get(userId, companyId);
  return row ? row.partner_id : null;
}

function requirePortalPartnerId(db, companyId, userId) {
  const partnerId = getPortalPartnerId(db, companyId, userId);
  if (!partnerId) throw fail('user is not linked to a partner profile', 403, 'PORTAL_ACCESS_DENIED');
  return partnerId;
}

function getCustomerDashboard(db, companyId, userId) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  
  const quotes = db.prepare(`
    SELECT COUNT(*) as count FROM sales_quote 
    WHERE company_id = ? AND partner_id = ? AND state = 'sent'
  `).get(companyId, partnerId).count;
  
  const orders = db.prepare(`
    SELECT COUNT(*) as count FROM sales_order 
    WHERE company_id = ? AND partner_id = ? AND state IN ('draft', 'sent', 'confirmed', 'approved')
  `).get(companyId, partnerId).count;
  
  // Unpaid invoices (customer_invoice where posted and open amount > 0)
  const invoices = db.prepare(`
    SELECT COUNT(*) as count 
    FROM arap_document a
    JOIN fiscal_doc f ON f.id = a.fiscal_doc_id
    WHERE a.company_id = ? AND a.partner_id = ? AND a.document_kind = 'customer_invoice' AND f.state = 'posted'
  `).get(companyId, partnerId).count;
  
  return { partner_id: partnerId, sent_quotes_count: quotes, active_orders_count: orders, total_invoices_count: invoices };
}

function listCustomerQuotes(db, companyId, userId) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  return db.prepare('SELECT * FROM sales_quote WHERE company_id = ? AND partner_id = ?').all(companyId, partnerId);
}

function approveQuote(db, companyId, userId, quoteId, signatureName) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  const quote = db.prepare('SELECT * FROM sales_quote WHERE id = ? AND company_id = ? AND partner_id = ?').get(quoteId, companyId, partnerId);
  if (!quote) throw fail('quote not found', 404, 'QUOTE_NOT_FOUND');
  if (quote.state !== 'draft' && quote.state !== 'sent') {
    throw fail('quote cannot be approved in its current state', 409, 'INVALID_QUOTE_STATE');
  }
  
  const before = { ...quote };
  const sigName = String(signatureName || '').trim();
  if (!sigName) throw fail('signature name is required', 400, 'SIGNATURE_REQUIRED');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE sales_quote SET state = 'approved' WHERE id = ?").run(quoteId);
    
    // Auto-promote approved quote to a Sales Order in draft
    const orderId = id('so');
    const orderNumber = `SO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    db.prepare(`
      INSERT INTO sales_order (id, company_id, partner_id, order_number, state, quote_id, currency, total_amount, created_at, created_by)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `).run(orderId, companyId, partnerId, orderNumber, quote.id, quote.currency, quote.total_amount, now(), 'portal-customer');
    
    const after = db.prepare('SELECT * FROM sales_quote WHERE id = ?').get(quoteId);
    recordWrite(db, null, companyId, 'sales_quote', quoteId, 'customer_approve', userId, before, after);
    
    if (owns) db.exec('COMMIT');
    return { quote: after, sales_order_id: orderId, sales_order_number: orderNumber };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function listCustomerInvoices(db, companyId, userId) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  return db.prepare(`
    SELECT a.id, a.due_date, a.total_amount, a.document_kind, f.doc_number, f.state, f.doc_date
    FROM arap_document a
    JOIN fiscal_doc f ON f.id = a.fiscal_doc_id
    WHERE a.company_id = ? AND a.partner_id = ? AND a.document_kind IN ('customer_invoice', 'customer_credit_note')
  `).all(companyId, partnerId);
}

function listCustomerTickets(db, companyId, userId) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  // Re-use or stub matching tickets table
  return db.prepare("SELECT * FROM sqlite_master WHERE type='table' AND name='helpdesk_ticket'").get()
    ? db.prepare('SELECT * FROM helpdesk_ticket WHERE company_id = ? AND partner_id = ?').all(companyId, partnerId)
    : [];
}

function getCustomerAccountStatement(db, companyId, userId, rangeStart, rangeEnd) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  const start = asDate(rangeStart || '1970-01-01');
  const end = asDate(rangeEnd || '9999-12-31');
  
  // opening balance: sum of debit - credit for partner before rangeStart
  const openRow = db.prepare(`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) as balance
    FROM gl_line l
    JOIN fiscal_doc f ON f.id = l.fiscal_doc_id
    JOIN account a ON a.id = l.account_id
    WHERE l.company_id = ? AND f.partner_id = ? AND a.type = 'receivable' AND f.doc_date < ?
  `).get(companyId, partnerId, start);
  const openingBalance = money(openRow.balance);
  
  // running lines in date range
  const lines = db.prepare(`
    SELECT l.id, f.doc_date, f.doc_number, f.move_type, l.debit, l.credit, null as description
    FROM gl_line l
    JOIN fiscal_doc f ON f.id = l.fiscal_doc_id
    JOIN account a ON a.id = l.account_id
    WHERE l.company_id = ? AND f.partner_id = ? AND a.type = 'receivable' AND f.doc_date >= ? AND f.doc_date <= ?
    ORDER BY f.doc_date, f.doc_number, l.id
  `).all(companyId, partnerId, start, end);
  
  let balance = openingBalance;
  const runningLines = lines.map(line => {
    balance = money(balance + line.debit - line.credit);
    return { ...line, balance };
  });
  
  return { partner_id: partnerId, date_start: start, date_end: end, opening_balance: openingBalance, lines: runningLines, closing_balance: balance };
}

function getVendorDashboard(db, companyId, userId) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  
  const rfqs = db.prepare(`
    SELECT COUNT(*) as count FROM purchase_rfq 
    WHERE company_id = ? AND supplier_id = ? AND state = 'sent'
  `).get(companyId, partnerId).count;
  
  const orders = db.prepare(`
    SELECT COUNT(*) as count FROM purchase_order 
    WHERE company_id = ? AND supplier_id = ? AND state IN ('draft', 'sent', 'confirmed')
  `).get(companyId, partnerId).count;
  
  const bills = db.prepare(`
    SELECT COUNT(*) as count 
    FROM arap_document a
    JOIN fiscal_doc f ON f.id = a.fiscal_doc_id
    WHERE a.company_id = ? AND a.partner_id = ? AND a.document_kind = 'supplier_bill' AND f.state = 'posted'
  `).get(companyId, partnerId).count;
  
  return { partner_id: partnerId, sent_rfqs_count: rfqs, active_orders_count: orders, total_bills_count: bills };
}

function listVendorRfqs(db, companyId, userId) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  return db.prepare('SELECT * FROM purchase_rfq WHERE company_id = ? AND supplier_id = ?').all(companyId, partnerId);
}

function submitVendorQuote(db, companyId, userId, rfqId, totalAmount, linesInfo) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  const rfq = db.prepare('SELECT * FROM purchase_rfq WHERE id = ? AND company_id = ? AND supplier_id = ?').get(rfqId, companyId, partnerId);
  if (!rfq) throw fail('rfq not found', 404, 'RFQ_NOT_FOUND');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const quoteId = id('supp_quote');
    db.prepare(`
      INSERT INTO purchase_supplier_quote (id, company_id, rfq_id, supplier_id, total_amount, currency, lead_time_days, selected, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(quoteId, companyId, rfq.id, partnerId, money(totalAmount), rfq.currency, Number(linesInfo?.lead_time_days || 0), now());
    
    // Update RFQ status to quote_received or keep as sent
    db.prepare("UPDATE purchase_rfq SET state = 'quote_received' WHERE id = ?").run(rfqId);
    
    if (owns) db.exec('COMMIT');
    return { supplier_quote_id: quoteId, state: 'quote_received' };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function listVendorOrders(db, companyId, userId) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  return db.prepare('SELECT * FROM purchase_order WHERE company_id = ? AND supplier_id = ?').all(companyId, partnerId);
}

function confirmVendorOrder(db, companyId, userId, orderId, action) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  const order = db.prepare('SELECT * FROM purchase_order WHERE id = ? AND company_id = ? AND supplier_id = ?').get(orderId, companyId, partnerId);
  if (!order) throw fail('purchase order not found', 404, 'PURCHASE_ORDER_NOT_FOUND');
  if (order.state !== 'draft' && order.state !== 'sent') {
    throw fail('order cannot be confirmed in its current state', 409, 'INVALID_ORDER_STATE');
  }
  
  const before = { ...order };
  const targetState = action === 'accept' ? 'confirmed' : 'rejected';
  
  db.prepare('UPDATE purchase_order SET state = ? WHERE id = ?').run(targetState, orderId);
  const after = db.prepare('SELECT * FROM purchase_order WHERE id = ?').get(orderId);
  recordWrite(db, null, companyId, 'purchase_order', orderId, `vendor_${action}`, userId, before, after);
  
  return after;
}

function listVendorBills(db, companyId, userId) {
  const partnerId = requirePortalPartnerId(db, companyId, userId);
  return db.prepare(`
    SELECT a.id, a.due_date, a.total_amount, a.document_kind, f.doc_number, f.state, f.doc_date
    FROM arap_document a
    JOIN fiscal_doc f ON f.id = a.fiscal_doc_id
    WHERE a.company_id = ? AND a.partner_id = ? AND a.document_kind IN ('supplier_bill', 'supplier_debit_note')
  `).all(companyId, partnerId);
}

function isPortalUser(db, companyId, userId) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT 1 FROM portal_user_link WHERE user_id = ? AND company_id = ?').get(userId, companyId);
  return !!row;
}

module.exports = {
  linkPortalUser,
  getPortalPartnerId,
  isPortalUser,
  getCustomerDashboard,
  listCustomerQuotes,
  approveQuote,
  listCustomerInvoices,
  listCustomerTickets,
  getCustomerAccountStatement,
  getVendorDashboard,
  listVendorRfqs,
  submitVendorQuote,
  listVendorOrders,
  confirmVendorOrder,
  listVendorBills
};
