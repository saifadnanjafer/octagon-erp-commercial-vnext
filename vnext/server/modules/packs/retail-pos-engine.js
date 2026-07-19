// clean-room; R9.3 Retail/POS pack domain engine.
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');
const { fail, ensureCompany } = infra;

function uid(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function required(value, message, code) { const v = String(value || '').trim(); if (!v) throw fail(message, 400, code); return v; }

function createStore(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const storeCode = required(input.store_code, 'store_code is required', 'STORE_CODE_REQUIRED');
  const name = required(input.name, 'store name is required', 'STORE_NAME_REQUIRED');
  if (db.prepare('SELECT 1 FROM shop_retail_store WHERE company_id = ? AND store_code = ?').get(companyId, storeCode)) throw fail('store code already exists', 409, 'STORE_EXISTS');
  const row = { id: uid('rstore'), company_id: companyId, store_code: storeCode, name, timezone: input.timezone || 'Asia/Baghdad', currency: input.currency || 'IQD', active: 1, created_at: now(), created_by: userId || 'system' };
  db.prepare('INSERT INTO shop_retail_store (id, company_id, store_code, name, timezone, currency, active, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(row.id, row.company_id, row.store_code, row.name, row.timezone, row.currency, row.active, row.created_at, row.created_by);
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

module.exports = {
  createStore: infra.atomicCommand(createStore), listStores,
  openShift: infra.atomicCommand(openShift), closeShift: infra.atomicCommand(closeShift),
  registerBarcode: infra.atomicCommand(registerBarcode), lookupBarcode,
  recordScan: infra.atomicCommand(recordScan)
};
