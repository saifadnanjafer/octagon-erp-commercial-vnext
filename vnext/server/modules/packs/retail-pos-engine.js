// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.3 (proprietary self, not copied)
// R9.3 Retail/POS pack domain engine.
// This file owns the Retail/POS source documents (store, shift, barcode,
// ticket, line, tax, payment). All stock, GL, payment, tax, audit, worklist,
// outbox and event effects are produced through canonical repository engines.
// The Retail/POS engine never directly INSERT/UPDATEs fiscal_doc,
// fiscal_doc_line, gl_line, stock_move, stock_ledger_line, bin, payment,
// payment_allocation, audit, outbox, or event tables.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const infra = require('../r3-infra');
const finance = require('../../finance/finance-engine');
const stock = require('../../stock/stock-engine');
const arap = require('../../finance/arap-engine');
const taxEngine = require('../../finance/tax-engine');

const { fail, ensureCompany, recordWrite, publish, idempotencyScope, rememberIdempotency, tableExists } = infra;

function uid(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function money(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function required(value, message, code) { const v = String(value || '').trim(); if (!v) throw fail(message, 400, code); return v; }

function publishEvent(db, type, companyId, userId, entity, recordId, payload) {
  if (!tableExists(db, 'vnext_event_log')) return;
  const { createEventService } = require('../../events/events');
  const events = createEventService({ db });
  events.publish({ type, companyId, userId: userId || 'system', audience: { kind: 'company' }, entity, recordId, payload });
}

function publishOutbox(db, type, companyId, userId, entity, recordId, payload) {
  if (!tableExists(db, 'vnext_outbox')) {
    throw fail('vnext_outbox table is missing', 500, 'OUTBOX_TABLE_MISSING');
  }
  const { createOutboxService } = require('../../events/outbox');
  const outbox = createOutboxService({ db });
  outbox.write({ type, companyId, userId: userId || 'system', entity, recordId, payload });
}

function withAtomicTransaction(db, work) {
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

function loadManifest() {
  const manifestPath = path.join(__dirname, 'retail-pos-manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

// ── Store registry ──

function createStore(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const storeCode = required(input.store_code, 'store_code is required', 'STORE_CODE_REQUIRED');
  const name = required(input.name, 'store name is required', 'STORE_NAME_REQUIRED');
  if (db.prepare('SELECT 1 FROM shop_retail_store WHERE company_id = ? AND store_code = ?').get(companyId, storeCode)) throw fail('store code already exists', 409, 'STORE_EXISTS');
  
  if (input.default_ewallet_account_id) {
    accountId(db, companyId, input.default_ewallet_account_id, null, 'liquidity');
  }

  const row = {
    id: uid('rstore'), company_id: companyId, store_code: storeCode, name, timezone: input.timezone || 'Asia/Baghdad', currency: input.currency || 'IQD',
    default_cash_account_id: input.default_cash_account_id || null,
    default_card_account_id: input.default_card_account_id || null,
    default_bank_account_id: input.default_bank_account_id || null,
    default_income_account_id: input.default_income_account_id || null,
    default_cogs_account_id: input.default_cogs_account_id || null,
    default_stock_account_id: input.default_stock_account_id || null,
    default_tax_account_id: input.default_tax_account_id || null,
    default_ar_account_id: input.default_ar_account_id || null,
    default_ewallet_account_id: input.default_ewallet_account_id || null,
    active: 1, created_at: now(), created_by: userId || 'system'
  };
  db.prepare(`INSERT INTO shop_retail_store (id, company_id, store_code, name, timezone, currency,
    default_cash_account_id, default_card_account_id, default_bank_account_id, default_income_account_id,
    default_cogs_account_id, default_stock_account_id, default_tax_account_id, default_ar_account_id,
    default_ewallet_account_id, active, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.company_id, row.store_code, row.name, row.timezone, row.currency,
      row.default_cash_account_id, row.default_card_account_id, row.default_bank_account_id, row.default_income_account_id,
      row.default_cogs_account_id, row.default_stock_account_id, row.default_tax_account_id, row.default_ar_account_id,
      row.default_ewallet_account_id, row.active, row.created_at, row.created_by);
  return row;
}

function listStores(db, companyId) { ensureCompany(db, companyId); return db.prepare('SELECT * FROM shop_retail_store WHERE company_id = ? ORDER BY store_code').all(companyId); }

function openShift(db, companyId, storeId, input, userId) {
  ensureCompany(db, companyId);
  const store = db.prepare('SELECT * FROM shop_retail_store WHERE id = ? AND company_id = ? AND active = 1').get(storeId, companyId);
  if (!store) throw fail('store not found', 404, 'STORE_NOT_FOUND');
  if (db.prepare("SELECT 1 FROM shop_retail_shift WHERE company_id = ? AND store_id = ? AND state = 'open'").get(companyId, storeId)) throw fail('store already has an open shift', 409, 'SHIFT_ALREADY_OPEN');
  const row = { id: uid('rshift'), company_id: companyId, store_id: storeId, shift_number: required(input.shift_number || `SHIFT-${Date.now().toString(36).toUpperCase()}`, 'shift_number is required', 'SHIFT_NUMBER_REQUIRED'), state: 'open', opened_by: userId || 'system', opened_at: now(), opening_float: Number(input.opening_float || 0), closed_by: null, closed_at: null, closing_total: null };
  if (row.opening_float < 0) throw fail('opening_float cannot be negative', 400, 'FLOAT_INVALID');
  db.prepare('INSERT INTO shop_retail_shift (id, company_id, store_id, shift_number, state, opened_by, opened_at, opening_float, closed_by, closed_at, closing_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(row.id, row.company_id, row.store_id, row.shift_number, row.state, row.opened_by, row.opened_at, row.opening_float, row.closed_by, row.closed_at, row.closing_total);
  return row;
}

function closeShift(db, companyId, shiftId, input, userId) {
  ensureCompany(db, companyId);
  const shift = db.prepare("SELECT * FROM shop_retail_shift WHERE id = ? AND company_id = ? AND state = 'open'").get(shiftId, companyId);
  if (!shift) throw fail('open shift not found', 404, 'SHIFT_NOT_FOUND');
  const closingTotal = Number(input.closing_total);
  if (!Number.isFinite(closingTotal) || closingTotal < 0) throw fail('closing_total must be non-negative', 400, 'CLOSING_TOTAL_INVALID');
  db.prepare("UPDATE shop_retail_shift SET state = 'closed', closed_by = ?, closed_at = ?, closing_total = ? WHERE id = ? AND company_id = ?").run(userId || 'system', now(), closingTotal, shiftId, companyId);
  return db.prepare('SELECT * FROM shop_retail_shift WHERE id = ?').get(shiftId);
}

function registerBarcode(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const productId = required(input.product_id, 'product_id is required', 'PRODUCT_REQUIRED');
  const product = db.prepare('SELECT 1 FROM product_master WHERE id = ? AND company_id = ? AND active = 1').get(productId, companyId);
  if (!product) throw fail('product is not active or outside company scope', 403, 'PRODUCT_NOT_FOUND');
  const barcode = required(input.barcode, 'barcode is required', 'BARCODE_REQUIRED');
  const type = input.barcode_type || 'ean13';
  if (!['ean8', 'ean13', 'upc', 'qr', 'internal'].includes(type)) throw fail('invalid barcode_type', 400, 'BARCODE_TYPE_INVALID');
  if (db.prepare('SELECT 1 FROM shop_retail_barcode WHERE company_id = ? AND barcode = ?').get(companyId, barcode)) throw fail('barcode already exists', 409, 'BARCODE_EXISTS');
  const row = { id: uid('rbarcode'), company_id: companyId, product_id: productId, barcode, barcode_type: type, active: 1, created_at: now(), created_by: userId || 'system' };
  db.prepare('INSERT INTO shop_retail_barcode (id, company_id, product_id, barcode, barcode_type, active, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(row.id, row.company_id, row.product_id, row.barcode, row.barcode_type, row.active, row.created_at, row.created_by);
  return row;
}

function lookupBarcode(db, companyId, barcode) { ensureCompany(db, companyId); return db.prepare('SELECT * FROM shop_retail_barcode WHERE company_id = ? AND barcode = ? AND active = 1').get(companyId, barcode) || null; }

function recordScan(db, companyId, storeId, shiftId, input, userId) {
  ensureCompany(db, companyId);
  const idem = required(input.idempotency_key, 'idempotency_key is required', 'IDEMPOTENCY_REQUIRED');
  const prior = db.prepare('SELECT * FROM shop_retail_scan_event WHERE company_id = ? AND idempotency_key = ?').get(companyId, idem);
  if (prior) return prior;
  const shift = db.prepare("SELECT * FROM shop_retail_shift WHERE id = ? AND store_id = ? AND company_id = ? AND state = 'open'").get(shiftId, storeId, companyId);
  if (!shift) throw fail('open shift not found for store', 404, 'SHIFT_NOT_FOUND');
  const barcode = lookupBarcode(db, companyId, required(input.barcode, 'barcode is required', 'BARCODE_REQUIRED'));
  if (!barcode) throw fail('active barcode not found', 404, 'BARCODE_NOT_FOUND');
  const action = input.action || 'sale';
  if (!['sale', 'return', 'count'].includes(action)) throw fail('invalid scan action', 400, 'SCAN_ACTION_INVALID');
  const quantity = Number(input.quantity || 1);
  if (!Number.isFinite(quantity) || quantity <= 0) throw fail('quantity must be positive', 400, 'QTY_INVALID');
  const row = { id: uid('rscan'), company_id: companyId, store_id: storeId, shift_id: shiftId, barcode_id: barcode.id, action, quantity, idempotency_key: idem, scanned_by: userId || 'system', created_at: now() };
  db.prepare('INSERT INTO shop_retail_scan_event (id, company_id, store_id, shift_id, barcode_id, action, quantity, idempotency_key, scanned_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(row.id, row.company_id, row.store_id, row.shift_id, row.barcode_id, row.action, row.quantity, row.idempotency_key, row.scanned_by, row.created_at);
  return row;
}

// ── Governed POS transaction adapter ──

function ensureStore(db, companyId, storeId) {
  const store = db.prepare('SELECT * FROM shop_retail_store WHERE id = ? AND company_id = ? AND active = 1').get(storeId, companyId);
  if (!store) throw fail('retail store is not active or outside company scope', 404, 'STORE_NOT_FOUND');
  return store;
}

function ensureOpenShift(db, companyId, storeId, shiftId) {
  const shift = db.prepare("SELECT * FROM shop_retail_shift WHERE id = ? AND store_id = ? AND company_id = ? AND state = 'open'").get(shiftId, storeId, companyId);
  if (!shift) throw fail('open shift not found for store', 409, 'SHIFT_NOT_OPEN');
  return shift;
}

function accountId(db, companyId, requested, fallback, type) {
  const id = requested || fallback;
  const row = db.prepare('SELECT id, type FROM account WHERE id = ? AND company_id = ? AND removed = 0').get(id, companyId);
  if (!row || (type && row.type !== type)) throw fail(`account ${id} is outside company scope or has wrong type`, 403, 'ACCOUNT_INVALID');
  return row.id;
}

function paymentAccountForMethod(db, companyId, store, method) {
  switch (method) {
    case 'cash': return accountId(db, companyId, store.default_cash_account_id, 'coa_101000', 'liquidity');
    case 'card': return accountId(db, companyId, store.default_card_account_id, 'coa_102000', 'liquidity');
    case 'bank': return accountId(db, companyId, store.default_bank_account_id, 'coa_102000', 'liquidity');
    case 'ewallet':
      if (!store.default_ewallet_account_id) throw fail('eWallet clearing account is not configured', 400, 'EWALLET_ACCOUNT_NOT_CONFIGURED');
      return accountId(db, companyId, store.default_ewallet_account_id, null, 'liquidity');
    case 'reference': return accountId(db, companyId, store.default_ar_account_id, 'coa_103000', 'receivable');
    default: throw fail('payment_method is invalid', 400, 'PAYMENT_METHOD_INVALID');
  }
}

// Store-specific warehouse/location master data is Retail/POS-owned setup:
// no canonical location-management service exists, so we ensure the store's
// internal stock location and a shared customer location are present before
// the first stock move. Stock moves themselves are posted through stock-engine.
function ensureStoreLocation(db, companyId, store) {
  const warehouseId = `wh_${store.id}`;
  const locationId = `loc_${store.id}`;
  const customerWarehouseId = `wh_customer_${companyId}`;
  const customerLocationId = `loc_customer_${companyId}`;
  db.prepare('INSERT OR IGNORE INTO warehouses (warehouse_id, company_id, name) VALUES (?, ?, ?)').run(warehouseId, companyId, `${store.name} Warehouse`);
  db.prepare('INSERT OR IGNORE INTO locations (location_id, warehouse_id, company_id, name, type) VALUES (?, ?, ?, ?, ?)').run(locationId, warehouseId, companyId, `${store.name} Stock`, 'internal');
  db.prepare('INSERT OR IGNORE INTO warehouses (warehouse_id, company_id, name) VALUES (?, ?, ?)').run(customerWarehouseId, companyId, 'Customer Warehouse');
  db.prepare('INSERT OR IGNORE INTO locations (location_id, warehouse_id, company_id, name, type) VALUES (?, ?, ?, ?, ?)').run(customerLocationId, customerWarehouseId, companyId, 'Customer Location', 'customer');
  return { internalId: locationId, customerId: customerLocationId };
}

function resolveProductLine(db, companyId, line) {
  if (!line || typeof line !== 'object') throw fail('ticket line must be an object', 400, 'LINE_INVALID');
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw fail('line quantity must be positive', 400, 'QTY_INVALID');
  const unitPrice = Number(line.unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw fail('line unit_price must be non-negative', 400, 'PRICE_INVALID');
  let product;
  let barcodeId = null;
  if (line.barcode) {
    const barcode = lookupBarcode(db, companyId, String(line.barcode));
    if (!barcode) throw fail('line barcode not found', 404, 'BARCODE_NOT_FOUND');
    product = db.prepare('SELECT * FROM product_master WHERE id = ? AND company_id = ? AND active = 1').get(barcode.product_id, companyId);
    if (!product) throw fail('line product is not active', 404, 'PRODUCT_NOT_FOUND');
    barcodeId = barcode.id;
  } else if (line.product_id) {
    product = db.prepare('SELECT * FROM product_master WHERE id = ? AND company_id = ? AND active = 1').get(String(line.product_id), companyId);
    if (!product) throw fail('line product is not active or outside company scope', 404, 'PRODUCT_NOT_FOUND');
  } else {
    throw fail('line must have product_id or barcode', 400, 'LINE_PRODUCT_REQUIRED');
  }
  return { product, barcodeId, quantity, unitPrice };
}

function computeLineDiscount(gross, line) {
  const amount = Number(line.discount_amount || 0);
  const percent = Number(line.discount_percent || 0);
  if (amount < 0 || percent < 0) throw fail('discount must be non-negative', 400, 'DISCOUNT_INVALID');
  if (percent > 100) throw fail('discount_percent cannot exceed 100', 400, 'DISCOUNT_INVALID');
  if (amount > 0 && percent > 0) throw fail('provide discount_amount or discount_percent, not both', 400, 'DISCOUNT_CONFLICT');
  let discount = 0;
  if (percent > 0) discount = money(gross * (percent / 100));
  else if (amount > 0) discount = money(amount);
  if (discount > gross) throw fail('discount cannot exceed line gross', 400, 'DISCOUNT_EXCEEDS_GROSS');
  return discount;
}

function computeTicketTaxes(db, companyId, lines, fiscalPositionId) {
  const results = [];
  let totalBase = 0;
  let totalTax = 0;
  for (const line of lines) {
    if (line.tax_id) {
      const tax = db.prepare('SELECT id FROM tax WHERE id = ? AND company_id = ? AND active = 1').get(line.tax_id, companyId);
      if (!tax) throw fail('line tax is not active or outside company scope', 404, 'TAX_NOT_FOUND');
    }
    const res = taxEngine.computeTaxes(db, companyId, {
      fiscalPositionId: fiscalPositionId || undefined,
      type: 'sale',
      lines: [{
        account_id: line.income_account_id,
        tax_id: line.tax_id || undefined,
        price_unit: line.net_per_unit,
        quantity: line.quantity,
        description: line.description
      }]
    });
    totalBase += res.total_base;
    totalTax += res.total_tax;
    results.push({ ...res, retailLine: line });
  }
  return { totalBase, totalTax, totalAmount: totalBase + totalTax, results };
}

function buildTicketNumber(db, companyId) {
  const prefix = 'POS';
  const nowDate = new Date();
  const year = nowDate.getFullYear();
  const month = String(nowDate.getMonth() + 1).padStart(2, '0');
  const key = `retail_ticket_${companyId}_${year}_${month}`;
  const row = db.prepare('SELECT next_number FROM x_sequences WHERE seq_key = ?').get(key);
  let n = 1;
  if (!row) db.prepare('INSERT INTO x_sequences (seq_key, next_number, year, month, updated_at) VALUES (?, 2, ?, ?, ?)').run(key, year, month, now());
  else { n = Number(row.next_number); db.prepare('UPDATE x_sequences SET next_number = ?, updated_at = ? WHERE seq_key = ?').run(n + 1, now(), key); }
  return `${prefix}-${year}${month}-${String(n).padStart(5, '0')}`;
}

function postStockForLine(db, companyId, store, locations, product, quantity, direction, userId) {
  const moveId = uid('rsm');
  const from = direction === 'out' ? locations.internalId : locations.customerId;
  const to = direction === 'out' ? locations.customerId : locations.internalId;
  stock.createStockMove(db, companyId, {
    id: moveId,
    product_id: product.id,
    qty: quantity,
    uom: product.base_uom_id || 'units',
    from_location_id: from,
    to_location_id: to,
    posting_date: now().slice(0, 10),
    voucher_ref: `retail-${direction}-${moveId}`
  });
  const posted = stock.postStockMove(db, companyId, moveId, userId, { negative_stock_policy: 'block' });
  return { moveId, fiscalDocId: posted.fiscalDocId };
}

function buildFiscalLines(db, companyId, store, ticket, taxResults, paymentMethod) {
  const lines = [];
  const paymentAccount = paymentAccountForMethod(db, companyId, store, paymentMethod);
  lines.push({ account_id: paymentAccount, debit: ticket.total, credit: 0, description: `Retail ${paymentMethod} ${ticket.ticket_number}` });

  const incomeByAccount = {};
  for (const res of taxResults.results) {
    for (const cl of res.lines) {
      if (cl.repartition_type === 'base') {
        incomeByAccount[cl.account_id] = (incomeByAccount[cl.account_id] || 0) + cl.base_amount;
      }
    }
  }
  for (const [accountId, amount] of Object.entries(incomeByAccount)) {
    if (amount > 0) lines.push({ account_id: accountId, debit: 0, credit: money(amount), description: `Retail income ${ticket.ticket_number}` });
  }

  const taxByAccount = {};
  for (const res of taxResults.results) {
    for (const cl of res.lines) {
      if (cl.repartition_type === 'tax') {
        taxByAccount[cl.account_id] = (taxByAccount[cl.account_id] || 0) + cl.tax_amount;
      }
    }
  }
  // Fallback: when the tax engine has no repartition rows configured, attribute
  // all computed tax to the store's default tax liability account.
  const repartitionedTax = Object.values(taxByAccount).reduce((sum, amount) => sum + amount, 0);
  if (taxResults.totalTax > 0 && Math.abs(repartitionedTax - taxResults.totalTax) > 0.001) {
    const taxAccount = accountId(db, companyId, store.default_tax_account_id, 'coa_202000', 'liability');
    taxByAccount[taxAccount] = (taxByAccount[taxAccount] || 0) + money(taxResults.totalTax - repartitionedTax);
  }
  for (const [accountId, amount] of Object.entries(taxByAccount)) {
    if (amount > 0) lines.push({ account_id: accountId, debit: 0, credit: money(amount), description: `Retail tax ${ticket.ticket_number}` });
  }

  return lines;
}

function validatePaymentMethod(method) {
  if (!['cash', 'card', 'bank', 'reference', 'ewallet'].includes(method)) throw fail('payment_method is invalid', 400, 'PAYMENT_METHOD_INVALID');
}

function ensureWalkInPartner(db, companyId) {
  const id = 'partner_walkin';
  const existing = db.prepare('SELECT * FROM partner_master WHERE id = ? AND company_id = ?').get(id, companyId);
  if (existing) return existing;
  arap.createPartner(db, companyId, { id, name: 'Walk-in Customer', partner_type: 'customer' }, 'system');
  return db.prepare('SELECT * FROM partner_master WHERE id = ?').get(id);
}

function normalizeSalePayload(input) {
  const idem = String(input.idempotency_key || '').trim();
  if (!idem) throw fail('idempotency_key is required', 400, 'IDEMPOTENCY_REQUIRED');
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 200) throw fail('ticket lines are required (1..200)', 400, 'LINES_REQUIRED');
  validatePaymentMethod(input.payment_method);
  return { idem };
}

function insertTicket(db, ticket) {
  db.prepare(`INSERT INTO shop_retail_ticket (id, company_id, store_id, shift_id, ticket_number, kind, state, partner_id, currency,
    subtotal, discount_total, tax_total, total, payment_method, payment_reference, fiscal_doc_id, stock_move_id,
    reversal_of_id, reversal_ticket_id, idempotency_key, arap_document_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ticket.id, ticket.company_id, ticket.store_id, ticket.shift_id, ticket.ticket_number, ticket.kind, ticket.state, ticket.partner_id, ticket.currency,
      ticket.subtotal, ticket.discount_total, ticket.tax_total, ticket.total, ticket.payment_method, ticket.payment_reference, ticket.fiscal_doc_id, ticket.stock_move_id,
      ticket.reversal_of_id, ticket.reversal_ticket_id, ticket.idempotency_key, ticket.arap_document_id, ticket.created_at, ticket.created_by);
}

function insertTicketLine(db, line) {
  db.prepare(`INSERT INTO shop_retail_ticket_line (id, ticket_id, company_id, product_id, barcode_id, quantity, unit_price,
    discount_amount, discount_percent, tax_id, tax_amount, line_total, income_account_id, cogs_account_id, stock_move_id, created_at, base_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(line.id, line.ticket_id, line.company_id, line.product_id, line.barcode_id, line.quantity, line.unit_price, line.discount_amount, line.discount_percent, line.tax_id, line.tax_amount, line.line_total, line.income_account_id, line.cogs_account_id, line.stock_move_id, line.created_at, line.base_amount);
}

function insertTicketTax(db, tax) {
  db.prepare('INSERT INTO shop_retail_ticket_tax (id, ticket_id, company_id, tax_id, base_amount, tax_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tax.id, tax.ticket_id, tax.company_id, tax.tax_id, tax.base_amount, tax.tax_amount, tax.created_at);
}

function insertTicketPayment(db, payment) {
  db.prepare('INSERT INTO shop_retail_ticket_payment (id, ticket_id, company_id, payment_method, amount, reference, payment_id, fiscal_doc_id, arap_document_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(payment.id, payment.ticket_id, payment.company_id, payment.payment_method, payment.amount, payment.reference, payment.payment_id, payment.fiscal_doc_id, payment.arap_document_id, payment.created_at);
}

function postSale(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const { idem } = normalizeSalePayload(input);
  const store = ensureStore(db, companyId, input.store_id);
  const shift = ensureOpenShift(db, companyId, store.id, input.shift_id);
  const idemScope = idempotencyScope(db, userId, companyId, 'retail.sale', idem, input);
  if (idemScope?.replay) return { ...idemScope.replay, replayed: true };

  return withAtomicTransaction(db, () => {
    const locations = ensureStoreLocation(db, companyId, store);
    const ticketId = uid('rtkt');
    const ticketNumber = buildTicketNumber(db, companyId);
    const lines = [];
    let subtotal = 0;
    let discountTotal = 0;
    const lineStockMoves = [];

    // Phase 1: validate lines, compute discounts, post stock
    for (let i = 0; i < input.lines.length; i++) {
      const raw = input.lines[i];
      const { product, barcodeId, quantity, unitPrice } = resolveProductLine(db, companyId, raw);
      const gross = money(quantity * unitPrice);
      const discount = computeLineDiscount(gross, raw);
      const net = money(gross - discount);
      const incomeAccount = accountId(db, companyId, store.default_income_account_id, 'coa_401000', 'income');
      const cogsAccount = accountId(db, companyId, store.default_cogs_account_id, 'coa_501000', 'expense');
      subtotal += gross;
      discountTotal += discount;
      const stockMove = postStockForLine(db, companyId, store, locations, product, quantity, 'out', userId);
      lineStockMoves.push(stockMove);
      lines.push({
        id: uid('rtln'), ticket_id: ticketId, company_id: companyId, product_id: product.id, barcode_id: barcodeId,
        quantity, unit_price: unitPrice, discount_amount: discount, discount_percent: Number(raw.discount_percent || 0),
        tax_id: raw.tax_id || null, net_per_unit: money(net / quantity),
        income_account_id: incomeAccount, cogs_account_id: cogsAccount, stock_move_id: stockMove.moveId, created_at: now()
      });
    }

    // Phase 2: canonical tax calculation
    const taxResults = computeTicketTaxes(db, companyId, lines, input.fiscal_position_id);
    const ticketTotal = money(taxResults.totalAmount);

    const ticket = {
      id: ticketId, company_id: companyId, store_id: store.id, shift_id: shift.id, ticket_number: ticketNumber,
      kind: 'sale', state: 'draft', partner_id: input.partner_id || null, currency: store.currency || 'IQD',
      subtotal: money(subtotal), discount_total: money(discountTotal), tax_total: money(taxResults.totalTax), total: ticketTotal,
      payment_method: input.payment_method, payment_reference: input.payment_reference || null,
      fiscal_doc_id: null, stock_move_id: lineStockMoves.length ? lineStockMoves[0].moveId : null,
      reversal_of_id: null, reversal_ticket_id: null, idempotency_key: idem, arap_document_id: null,
      created_at: now(), created_by: userId || 'system'
    };

    // Phase 3: Create invoice for the sale (for ALL payment methods)
    const partner = input.partner_id
      ? db.prepare('SELECT * FROM partner_master WHERE id = ? AND company_id = ? AND active = 1').get(input.partner_id, companyId)
      : ensureWalkInPartner(db, companyId);
    if (!partner) throw fail('partner not found for sale', 404, 'PARTNER_NOT_FOUND');

    const arapLines = [];
    for (const res of taxResults.results) {
      for (const cl of res.lines) {
        if (cl.repartition_type === 'base' && cl.base_amount > 0) {
          arapLines.push({
            product_id: res.retailLine.product_id,
            quantity: 1,
            price_unit: cl.base_amount,
            account_id: cl.account_id,
            description: `Retail income ${ticketNumber}`,
            tax_refs: cl.tag_ids ? JSON.stringify(cl.tag_ids) : null
          });
        } else if (cl.repartition_type === 'tax' && cl.tax_amount > 0) {
          arapLines.push({
            quantity: 1,
            price_unit: cl.tax_amount,
            account_id: cl.account_id,
            description: `Retail tax ${ticketNumber}`,
            tax_refs: cl.tag_ids ? JSON.stringify(cl.tag_ids) : null
          });
        }
      }
    }

    // Fallback tax repartition mapping
    const repartitionedTax = taxResults.results.reduce((sum, res) => {
      return sum + res.lines.reduce((s, cl) => cl.repartition_type === 'tax' ? s + cl.tax_amount : s, 0);
    }, 0);
    if (taxResults.totalTax > 0 && Math.abs(repartitionedTax - taxResults.totalTax) > 0.001) {
      const taxAccount = accountId(db, companyId, store.default_tax_account_id, 'coa_202000', 'liability');
      arapLines.push({
        quantity: 1,
        price_unit: money(taxResults.totalTax - repartitionedTax),
        account_id: taxAccount,
        description: `Retail tax fallback ${ticketNumber}`,
        tax_refs: null
      });
    }

    const arapDoc = arap.createArapDocument(db, companyId, {
      partner_id: partner.id,
      document_kind: 'customer_invoice',
      currency: ticket.currency,
      lines: arapLines
    }, userId);
    arap.postArapDocument(db, arapDoc.id, userId);

    ticket.arap_document_id = arapDoc.id;
    let paymentResult = null;
    let realPaymentId = null;
    let realPaymentFiscalDocId = null;

    if (input.payment_method === 'reference') {
      ticket.fiscal_doc_id = arapDoc.fiscal_doc_id;
      paymentResult = { arap_document_id: arapDoc.id };
    } else {
      // Create canonical payment record and allocate it to the invoice
      const paymentAccount = paymentAccountForMethod(db, companyId, store, input.payment_method);
      const payRes = arap.createPayment(db, companyId, {
        partner_id: partner.id,
        payment_type: 'receive',
        amount: ticketTotal,
        currency: ticket.currency,
        account_id: paymentAccount,
        idempotency_key: ticket.idempotency_key + '_pay',
        reference: ticket.payment_reference || `POS Payment ${ticketNumber}`,
        allocations: [{
          arap_document_id: arapDoc.id,
          amount: ticketTotal
        }]
      }, userId);
      realPaymentId = payRes.id;
      realPaymentFiscalDocId = payRes.fiscal_doc_id;
      // ticket.fiscal_doc_id points to the payment's fiscal doc for cash method compatibility
      ticket.fiscal_doc_id = payRes.fiscal_doc_id;
      paymentResult = { payment_id: payRes.id };
    }

    // Phase 4: persist ticket and lines
    insertTicket(db, ticket);
    for (const line of lines) {
      insertTicketLine(db, {
        ...line,
        tax_amount: money(taxResults.results.find(r => r.retailLine.id === line.id)?.total_tax || 0),
        line_total: money(taxResults.results.find(r => r.retailLine.id === line.id)?.total_amount || 0),
        base_amount: money(taxResults.results.find(r => r.retailLine.id === line.id)?.total_base || 0)
      });
    }

    // Persist tax rows
    for (const res of taxResults.results) {
      if (res.retailLine.tax_id && res.total_tax > 0) {
        insertTicketTax(db, {
          id: uid('rttx'), ticket_id: ticketId, company_id: companyId,
          tax_id: res.retailLine.tax_id, base_amount: money(res.total_base), tax_amount: money(res.total_tax), created_at: now()
        });
      }
    }

    // Persist payment record
    insertTicketPayment(db, {
      id: uid('rtpm'), ticket_id: ticketId, company_id: companyId,
      payment_method: ticket.payment_method, amount: ticket.total,
      reference: ticket.payment_reference, payment_id: realPaymentId,
      fiscal_doc_id: realPaymentFiscalDocId || arapDoc.fiscal_doc_id, arap_document_id: ticket.arap_document_id, created_at: now()
    });

    db.prepare('UPDATE shop_retail_ticket SET state = ? WHERE id = ?').run('posted', ticket.id);
    ticket.state = 'posted';

    recordWrite(db, null, companyId, 'shop_retail_ticket', ticket.id, 'post_sale', userId, null, ticket);
    
    // Durable Outbox & Event Log
    publishOutbox(db, 'retail.ticket.posted', companyId, userId, 'shop_retail_ticket', ticket.id, { kind: 'sale', total: ticket.total, storeId: store.id });
    publishEvent(db, 'retail.ticket.posted', companyId, userId, 'shop_retail_ticket', ticket.id, { kind: 'sale', total: ticket.total, storeId: store.id });

    const response = { ticket, lines: db.prepare('SELECT * FROM shop_retail_ticket_line WHERE ticket_id = ?').all(ticketId), payment: paymentResult };
    if (idemScope) rememberIdempotency(db, idemScope, response, 200);
    return response;
  });
}

function postReturn(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const originalTicketId = required(input.original_ticket_id, 'original_ticket_id is required', 'ORIGINAL_REQUIRED');
  const original = db.prepare("SELECT * FROM shop_retail_ticket WHERE id = ? AND company_id = ? AND kind = 'sale' AND state = 'posted'").get(originalTicketId, companyId);
  if (!original) throw fail('original posted sale ticket not found', 404, 'ORIGINAL_NOT_FOUND');
  const idem = String(input.idempotency_key || '').trim();
  if (!idem) throw fail('idempotency_key is required', 400, 'IDEMPOTENCY_REQUIRED');
  const idemScope = idempotencyScope(db, userId, companyId, 'retail.return', idem, input);
  if (idemScope?.replay) return { ...idemScope.replay, replayed: true };

  return withAtomicTransaction(db, () => {
    const store = ensureStore(db, companyId, original.store_id);
    const shift = ensureOpenShift(db, companyId, store.id, input.shift_id || original.shift_id);
    const originalLines = db.prepare('SELECT * FROM shop_retail_ticket_line WHERE ticket_id = ?').all(original.id);
    const lines = [];
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    // Reverse stock through canonical stock cancellation
    for (const originalLine of originalLines) {
      const product = db.prepare('SELECT * FROM product_master WHERE id = ? AND company_id = ? AND active = 1').get(originalLine.product_id, companyId);
      if (!product) throw fail('original line product no longer active', 409, 'PRODUCT_INACTIVE');
      const stockRes = stock.cancelStockMove(db, companyId, originalLine.stock_move_id, userId);
      subtotal += originalLine.quantity * originalLine.unit_price;
      discountTotal += originalLine.discount_amount;
      taxTotal += originalLine.tax_amount;
      lines.push({
        id: uid('rtln'), ticket_id: null, company_id: companyId,
        product_id: originalLine.product_id, barcode_id: originalLine.barcode_id,
        quantity: originalLine.quantity, unit_price: originalLine.unit_price,
        discount_amount: originalLine.discount_amount, discount_percent: originalLine.discount_percent,
        tax_id: originalLine.tax_id, tax_amount: originalLine.tax_amount,
        line_total: originalLine.line_total, income_account_id: originalLine.income_account_id,
        cogs_account_id: originalLine.cogs_account_id, stock_move_id: stockRes.reversalMoveId,
        created_at: now(), base_amount: originalLine.base_amount
      });
    }

    // Create Credit Note (Common to both reference and cash/card/bank/ewallet sales)
    const partner = original.partner_id
      ? db.prepare('SELECT * FROM partner_master WHERE id = ? AND company_id = ? AND active = 1').get(original.partner_id, companyId)
      : ensureWalkInPartner(db, companyId);
    
    const arapLines = [];
    for (const line of originalLines) {
      const lineTax = taxEngine.computeTaxes(db, companyId, {
        type: 'sale',
        lines: [{
          account_id: line.income_account_id,
          tax_id: line.tax_id || undefined,
          price_unit: line.net_per_unit || money((line.line_total - line.tax_amount)/line.quantity),
          quantity: line.quantity
        }]
      });
      for (const cl of lineTax.lines) {
        if (cl.repartition_type === 'base' && cl.base_amount > 0) {
          arapLines.push({
            product_id: line.product_id,
            quantity: 1,
            price_unit: cl.base_amount,
            account_id: cl.account_id,
            description: `Return of Retail income ${original.ticket_number}`,
            tax_refs: cl.tag_ids ? JSON.stringify(cl.tag_ids) : null
          });
        } else if (cl.repartition_type === 'tax' && cl.tax_amount > 0) {
          arapLines.push({
            quantity: 1,
            price_unit: cl.tax_amount,
            account_id: cl.account_id,
            description: `Return of Retail tax ${original.ticket_number}`,
            tax_refs: cl.tag_ids ? JSON.stringify(cl.tag_ids) : null
          });
        }
      }
    }
    
    const creditNote = arap.createArapDocument(db, companyId, {
      partner_id: partner.id,
      document_kind: 'customer_credit_note',
      currency: original.currency,
      reversal_of_id: original.arap_document_id,
      lines: arapLines
    }, userId);
    arap.postArapDocument(db, creditNote.id, userId);

    let realPaymentId = null;
    let realPaymentFiscalDocId = null;

    if (original.payment_method !== 'reference') {
      const paymentAccount = paymentAccountForMethod(db, companyId, store, original.payment_method);
      const payRes = arap.createPayment(db, companyId, {
        partner_id: partner.id,
        payment_type: 'pay',
        amount: original.total,
        currency: original.currency,
        account_id: paymentAccount,
        control_account_id: partner.receivable_account_id || 'coa_103000',
        idempotency_key: idem + '_pay',
        reference: `Return of ${original.ticket_number}`,
        allocations: [{
          arap_document_id: creditNote.id,
          amount: original.total
        }]
      }, userId);
      realPaymentId = payRes.id;
      realPaymentFiscalDocId = payRes.fiscal_doc_id;
    }

    const ticketId = uid('rtkt');
    const ticketNumber = buildTicketNumber(db, companyId);
    const ticket = {
      id: ticketId, company_id: companyId, store_id: store.id, shift_id: shift.id, ticket_number: ticketNumber,
      kind: 'return', state: 'posted', partner_id: original.partner_id, currency: original.currency,
      subtotal: money(subtotal), discount_total: money(discountTotal), tax_total: money(taxTotal),
      total: original.total,
      payment_method: original.payment_method, payment_reference: input.payment_reference || `Return of ${original.ticket_number}`,
      fiscal_doc_id: realPaymentFiscalDocId || creditNote.fiscal_doc_id, stock_move_id: lines.length ? lines[0].stock_move_id : null,
      reversal_of_id: original.id, reversal_ticket_id: null, idempotency_key: idem, arap_document_id: creditNote.id,
      created_at: now(), created_by: userId || 'system'
    };

    insertTicket(db, ticket);
    for (const line of lines) insertTicketLine(db, { ...line, ticket_id: ticketId });

    // Persist tax rows for return
    const originalTaxes = db.prepare('SELECT * FROM shop_retail_ticket_tax WHERE ticket_id = ?').all(original.id);
    for (const tax of originalTaxes) {
      insertTicketTax(db, { id: uid('rttx'), ticket_id: ticketId, company_id: companyId, tax_id: tax.tax_id, base_amount: tax.base_amount, tax_amount: tax.tax_amount, created_at: now() });
    }

    // Persist payment record for return
    insertTicketPayment(db, {
      id: uid('rtpm'), ticket_id: ticketId, company_id: companyId,
      payment_method: ticket.payment_method, amount: ticket.total,
      reference: ticket.payment_reference, payment_id: realPaymentId,
      fiscal_doc_id: realPaymentFiscalDocId || creditNote.fiscal_doc_id, arap_document_id: creditNote.id, created_at: now()
    });

    db.prepare('UPDATE shop_retail_ticket SET state = ?, reversal_ticket_id = ? WHERE id = ?').run('reversed', ticket.id, original.id);

    recordWrite(db, null, companyId, 'shop_retail_ticket', ticket.id, 'post_return', userId, null, ticket, 'retail_returns');
    
    // Durable Outbox & Event Log
    publishOutbox(db, 'retail.ticket.returned', companyId, userId, 'shop_retail_ticket', ticket.id, { originalId: original.id, total: ticket.total });
    publishEvent(db, 'retail.ticket.returned', companyId, userId, 'shop_retail_ticket', ticket.id, { originalId: original.id, total: ticket.total });

    const response = { ticket, original_ticket_id: original.id, lines: db.prepare('SELECT * FROM shop_retail_ticket_line WHERE ticket_id = ?').all(ticketId) };
    if (idemScope) rememberIdempotency(db, idemScope, response, 200);
    return response;
  });
}

function refundableBalance(db, companyId, originalId) {
  const original = db.prepare('SELECT total FROM shop_retail_ticket WHERE id = ? AND company_id = ?').get(originalId, companyId);
  if (!original) throw fail('original ticket not found', 404, 'ORIGINAL_NOT_FOUND');
  const refunded = db.prepare("SELECT COALESCE(SUM(total), 0) AS amount FROM shop_retail_ticket WHERE reversal_of_id = ? AND kind = 'refund' AND state = 'posted'").get(originalId).amount;
  return money(Number(original.total) - Number(refunded));
}

function postRefund(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const originalTicketId = required(input.original_ticket_id, 'original_ticket_id is required', 'ORIGINAL_REQUIRED');
  const original = db.prepare("SELECT * FROM shop_retail_ticket WHERE id = ? AND company_id = ? AND state = 'posted'").get(originalTicketId, companyId);
  if (!original) throw fail('original posted ticket not found', 404, 'ORIGINAL_NOT_FOUND');
  const idem = String(input.idempotency_key || '').trim();
  if (!idem) throw fail('idempotency_key is required', 400, 'IDEMPOTENCY_REQUIRED');
  const idemScope = idempotencyScope(db, userId, companyId, 'retail.refund', idem, input);
  if (idemScope?.replay) return { ...idemScope.replay, replayed: true };

  return withAtomicTransaction(db, () => {
    const store = ensureStore(db, companyId, original.store_id);
    ensureOpenShift(db, companyId, store.id, input.shift_id || original.shift_id);
    const amount = money(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw fail('refund amount must be positive', 400, 'REFUND_AMOUNT_INVALID');
    const balance = refundableBalance(db, companyId, original.id);
    if (amount > balance + 0.0001) throw fail(`refund exceeds refundable balance (${balance})`, 409, 'REFUND_EXCEEDS_BALANCE');

    const ticketNumber = buildTicketNumber(db, companyId);
    const paymentAccount = paymentAccountForMethod(db, companyId, store, original.payment_method);

    const partner = original.partner_id
      ? db.prepare('SELECT * FROM partner_master WHERE id = ? AND company_id = ? AND active = 1').get(original.partner_id, companyId)
      : ensureWalkInPartner(db, companyId);

    // Fetch the original credit lines from the invoice's fiscal doc and scale them proportionally
    const originalArap = db.prepare('SELECT fiscal_doc_id FROM arap_document WHERE id = ?').get(original.arap_document_id);
    if (!originalArap) throw fail('original invoice not found', 404, 'INVOICE_NOT_FOUND');
    const originalLines = db.prepare('SELECT account_id, credit, tax_refs, dims, description FROM fiscal_doc_line WHERE fiscal_doc_id = ? AND credit > 0').all(originalArap.fiscal_doc_id);

    const ratio = amount / Number(original.total);
    const arapLines = [];
    let allocatedSum = 0;
    for (const line of originalLines) {
      const lineAmount = money(Number(line.credit) * ratio);
      allocatedSum += lineAmount;
      arapLines.push({
        account_id: line.account_id,
        quantity: 1,
        price_unit: lineAmount,
        description: `Reversal of: ${line.description}`,
        tax_refs: line.tax_refs,
        dims: line.dims ? JSON.parse(line.dims) : null
      });
    }
    const diff = money(amount - allocatedSum);
    if (diff !== 0 && arapLines.length > 0) {
      arapLines[0].price_unit = money(arapLines[0].price_unit + diff);
    }

    const creditNote = arap.createArapDocument(db, companyId, {
      partner_id: partner.id,
      document_kind: 'customer_credit_note',
      currency: original.currency,
      reversal_of_id: original.arap_document_id,
      lines: arapLines
    }, userId);
    arap.postArapDocument(db, creditNote.id, userId);

    let realPaymentId = null;
    let realPaymentFiscalDocId = null;

    if (original.payment_method !== 'reference') {
      const payRes = arap.createPayment(db, companyId, {
        partner_id: partner.id,
        payment_type: 'pay',
        amount: amount,
        currency: original.currency,
        account_id: paymentAccount,
        control_account_id: partner.receivable_account_id || 'coa_103000',
        idempotency_key: idem + '_pay',
        reference: `Refund of ${original.ticket_number}`,
        allocations: [{
          arap_document_id: creditNote.id,
          amount: amount
        }]
      }, userId);
      realPaymentId = payRes.id;
      realPaymentFiscalDocId = payRes.fiscal_doc_id;
    }

    const ticket = {
      id: uid('rtkt'), company_id: companyId, store_id: original.store_id, shift_id: original.shift_id, ticket_number: ticketNumber,
      kind: 'refund', state: 'posted', partner_id: original.partner_id, currency: original.currency,
      subtotal: 0, discount_total: 0, tax_total: 0, total: amount,
      payment_method: original.payment_method, payment_reference: input.payment_reference || `Refund of ${original.ticket_number}`,
      fiscal_doc_id: realPaymentFiscalDocId || creditNote.fiscal_doc_id, stock_move_id: null,
      reversal_of_id: original.id, reversal_ticket_id: null, idempotency_key: idem, arap_document_id: creditNote.id,
      created_at: now(), created_by: userId || 'system'
    };

    insertTicket(db, ticket);
    insertTicketPayment(db, {
      id: uid('rtpm'), ticket_id: ticket.id, company_id: companyId,
      payment_method: ticket.payment_method, amount, reference: ticket.payment_reference,
      payment_id: realPaymentId, fiscal_doc_id: realPaymentFiscalDocId || creditNote.fiscal_doc_id, arap_document_id: creditNote.id, created_at: now()
    });

    recordWrite(db, null, companyId, 'shop_retail_ticket', ticket.id, 'post_refund', userId, null, ticket, 'retail_refunds');
    
    // Durable Outbox & Event Log
    publishOutbox(db, 'retail.ticket.refunded', companyId, userId, 'shop_retail_ticket', ticket.id, { originalId: original.id, amount });
    publishEvent(db, 'retail.ticket.refunded', companyId, userId, 'shop_retail_ticket', ticket.id, { originalId: original.id, amount });

    const response = { ticket, original_ticket_id: original.id };
    if (idemScope) rememberIdempotency(db, idemScope, response, 200);
    return response;
  });
}

function cancelTicket(db, companyId, ticketId, input, userId) {
  ensureCompany(db, companyId);
  if (!input || typeof input !== 'object') throw fail('input object is required', 400, 'INPUT_REQUIRED');
  const idem = String(input.idempotency_key || '').trim();
  if (!idem) throw fail('idempotency_key is required', 400, 'IDEMPOTENCY_REQUIRED');

  const ticket = db.prepare('SELECT * FROM shop_retail_ticket WHERE id = ? AND company_id = ?').get(ticketId, companyId);
  if (!ticket) throw fail('ticket not found', 404, 'TICKET_NOT_FOUND');

  const idemScope = idempotencyScope(db, userId, companyId, 'retail.cancel', idem, input);
  if (idemScope?.replay) return { ...idemScope.replay, replayed: true };

  if (ticket.state === 'cancelled') return { ticket, cancelled: true };
  if (ticket.state === 'reversed') throw fail('already reversed ticket cannot be cancelled', 409, 'TICKET_ALREADY_REVERSED');
  if (ticket.state !== 'draft' && ticket.state !== 'posted') throw fail('ticket state does not allow cancellation', 409, 'TICKET_STATE_INVALID');

  return withAtomicTransaction(db, () => {
    if (ticket.state === 'draft') {
      db.prepare('UPDATE shop_retail_ticket SET state = ? WHERE id = ?').run('cancelled', ticket.id);
      recordWrite(db, null, companyId, 'shop_retail_ticket', ticket.id, 'cancel', userId, ticket, { ...ticket, state: 'cancelled' });
      const response = { ticket: { ...ticket, state: 'cancelled' }, cancelled: true };
      if (idemScope) rememberIdempotency(db, idemScope, response, 200);
      return response;
    }

    // Posted ticket: full governed reversal
    const store = ensureStore(db, companyId, ticket.store_id);
    const originalLines = db.prepare('SELECT * FROM shop_retail_ticket_line WHERE ticket_id = ?').all(ticket.id);
    const reversedStock = [];

    for (const line of originalLines) {
      const stockRes = stock.cancelStockMove(db, companyId, line.stock_move_id, userId);
      reversedStock.push(stockRes.reversalMoveId);
    }

    let arapReversalId = null;
    let reversalFiscalDocId = null;

    const arapDoc = db.prepare('SELECT fiscal_doc_id FROM arap_document WHERE id = ?').get(ticket.arap_document_id);
    if (arapDoc) {
      // Build Credit Note replicating the original invoice's lines
      const originalLines = db.prepare('SELECT account_id, credit, tax_refs, dims, description FROM fiscal_doc_line WHERE fiscal_doc_id = ? AND credit > 0').all(arapDoc.fiscal_doc_id);
      const arapLines = originalLines.map(line => ({
        account_id: line.account_id,
        quantity: 1,
        price_unit: Number(line.credit),
        description: `Cancellation of: ${line.description}`,
        tax_refs: line.tax_refs,
        dims: line.dims ? JSON.parse(line.dims) : null
      }));

      const creditNote = arap.createArapDocument(db, companyId, {
        partner_id: ticket.partner_id || ensureWalkInPartner(db, companyId).id,
        document_kind: 'customer_credit_note',
        currency: ticket.currency,
        reversal_of_id: ticket.arap_document_id,
        lines: arapLines
      }, userId);
      arap.postArapDocument(db, creditNote.id, userId);
      arapReversalId = creditNote.id;
      reversalFiscalDocId = creditNote.fiscal_doc_id;
    }

    if (ticket.payment_method !== 'reference') {
      // Cash/card/bank/ewallet cancellation:
      // Reverse the payment canonically (calls reverseFiscalDoc and sets payment to cancelled)
      const origPayment = db.prepare('SELECT * FROM shop_retail_ticket_payment WHERE ticket_id = ?').get(ticket.id);
      if (origPayment && origPayment.payment_id) {
        arap.reversePayment(db, origPayment.payment_id, userId);
      }
    }

    db.prepare('UPDATE shop_retail_ticket SET state = ?, reversal_ticket_id = ? WHERE id = ?').run('cancelled', null, ticket.id);
    const updated = { ...ticket, state: 'cancelled', reversal_fiscal_doc_id: reversalFiscalDocId, reversal_stock_moves: reversedStock, arap_reversal_id: arapReversalId };
    recordWrite(db, null, companyId, 'shop_retail_ticket', ticket.id, 'cancel_posted', userId, ticket, updated, 'retail_cancellations');
    
    // Durable Outbox & Event Log
    publishOutbox(db, 'retail.ticket.cancelled', companyId, userId, 'shop_retail_ticket', ticket.id, { ticketId: ticket.id, total: ticket.total });
    publishEvent(db, 'retail.ticket.cancelled', companyId, userId, 'shop_retail_ticket', ticket.id, { ticketId: ticket.id, total: ticket.total });

    const response = { ticket: updated, cancelled: true, reversal_fiscal_doc_id: reversalFiscalDocId, arap_reversal_id: arapReversalId };
    if (idemScope) rememberIdempotency(db, idemScope, response, 200);
    return response;
  });
}

function getTicket(db, companyId, ticketId) {
  const ticket = db.prepare('SELECT * FROM shop_retail_ticket WHERE id = ? AND company_id = ?').get(ticketId, companyId);
  if (!ticket) throw fail('ticket not found', 404, 'TICKET_NOT_FOUND');
  return {
    ticket,
    lines: db.prepare('SELECT * FROM shop_retail_ticket_line WHERE ticket_id = ? ORDER BY id').all(ticketId),
    taxes: db.prepare('SELECT * FROM shop_retail_ticket_tax WHERE ticket_id = ?').all(ticketId),
    payments: db.prepare('SELECT * FROM shop_retail_ticket_payment WHERE ticket_id = ?').all(ticketId)
  };
}

function listTickets(db, companyId, opts = {}) {
  ensureCompany(db, companyId);
  const state = opts.state ? 'AND state = ?' : '';
  const store = opts.store_id ? 'AND store_id = ?' : '';
  const params = [companyId];
  if (opts.state) params.push(opts.state);
  if (opts.store_id) params.push(opts.store_id);
  return db.prepare(`SELECT * FROM shop_retail_ticket WHERE company_id = ? ${state} ${store} ORDER BY created_at DESC`).all(...params);
}

module.exports = {
  createStore: infra.atomicCommand(createStore), listStores,
  openShift: infra.atomicCommand(openShift), closeShift: infra.atomicCommand(closeShift),
  registerBarcode: infra.atomicCommand(registerBarcode), lookupBarcode,
  recordScan: infra.atomicCommand(recordScan),
  postSale, postReturn, postRefund, cancelTicket, getTicket, listTickets, loadManifest,
  _internal: { withAtomicTransaction, ensureStoreLocation, computeTicketTaxes, paymentAccountForMethod }
};
