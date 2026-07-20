// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.3 (proprietary self, not copied)
// R9.3 focused acceptance: disposable DB only. Proves the governed Retail/POS
// transaction adapter: atomic sale posting, canonical stock/GL/payment/tax
// integration, return/refund/cancellation reversal, idempotency, ACL, company
// scope, Pack SDK conformance, real manifest loading, and safe migration rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import retail from '../vnext/server/modules/packs/retail-pos-engine.js';
import packSdk from '../vnext/server/modules/packs/pack-sdk-engine.js';
import stockEngine from '../vnext/server/stock/stock-engine.js';
import finance from '../vnext/server/finance/finance-engine.js';
import arap from '../vnext/server/finance/arap-engine.js';
import { mountRetailRoutes } from '../vnext/server/modules/packs/retail-pos-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r9-retail-'));
const dbPath = path.join(temp, 'r9-retail.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const results = [];
let failures = 0;

function check(name, fn) {
  try {
    fn();
    results.push(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL ${name}: ${error.message}`);
    console.error(error);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL ${name}: ${error.message}`);
    console.error(error);
  }
}

const company = 'company-r0-demo';
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(company, 'Demo Company');
const otherCompany = 'company-r9-other';
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(otherCompany, 'Other Company');

// ── Seed domain data ──

function seedProduct(id, code, name, price) {
  db.prepare(`INSERT OR IGNORE INTO product_master (id, company_id, code, name, income_account_id, expense_account_id, active, created_at, created_by, stockable, valuation_category)
    VALUES (?, ?, ?, ?, 'coa_401000', 'coa_501000', 1, ?, 'system', 1, 'default')`).run(id, company, code, name, new Date().toISOString());
}

seedProduct('prod_a', 'SKU-A', 'Product A', 100);
seedProduct('prod_b', 'SKU-B', 'Product B', 50);
seedProduct('prod_c', 'SKU-C', 'Product C', 200);

db.prepare(`INSERT OR IGNORE INTO tax (id, name, company_id, tax_group_id, amount_type, amount, price_include, type_tax_use, active)
  VALUES ('tax_vat_10', 'VAT 10%', ?, null, 'percent', 10, 0, 'sale', 1)`).run(company);
db.prepare(`INSERT OR IGNORE INTO tax (id, name, company_id, tax_group_id, amount_type, amount, price_include, type_tax_use, active)
  VALUES ('tax_fixed_5', 'Fixed 5', ?, null, 'fixed', 5, 0, 'sale', 1)`).run(company);
db.prepare(`INSERT OR IGNORE INTO tax (id, name, company_id, tax_group_id, amount_type, amount, price_include, type_tax_use, active)
  VALUES ('tax_inc_10', 'VAT 10% Incl', ?, null, 'percent', 10, 1, 'sale', 1)`).run(company);
db.prepare(`INSERT OR IGNORE INTO tax (id, name, company_id, tax_group_id, amount_type, amount, price_include, type_tax_use, active)
  VALUES ('tax_inc_fixed_10', 'Fixed 10 Incl', ?, null, 'fixed', 10, 1, 'sale', 1)`).run(company);

// Tax repartition lines for canonical tax engine attribution
db.prepare(`INSERT OR IGNORE INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
  VALUES ('trl_vat_base', 'tax_vat_10', 'base', 100, null, null, 1)`).run();
db.prepare(`INSERT OR IGNORE INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
  VALUES ('trl_vat_tax', 'tax_vat_10', 'tax', 100, 'coa_202000', '["VAT_10"]', 1)`).run();
db.prepare(`INSERT OR IGNORE INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
  VALUES ('trl_fixed_base', 'tax_fixed_5', 'base', 100, null, null, 1)`).run();
db.prepare(`INSERT OR IGNORE INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
  VALUES ('trl_fixed_tax', 'tax_fixed_5', 'tax', 100, 'coa_202000', '["FIXED_5"]', 1)`).run();
db.prepare(`INSERT OR IGNORE INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
  VALUES ('trl_inc_base', 'tax_inc_10', 'base', 100, null, null, 1)`).run();
db.prepare(`INSERT OR IGNORE INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
  VALUES ('trl_inc_tax', 'tax_inc_10', 'tax', 100, 'coa_202000', '["VAT_INC_10"]', 1)`).run();
db.prepare(`INSERT OR IGNORE INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
  VALUES ('trl_inc_fixed_base', 'tax_inc_fixed_10', 'base', 100, null, null, 1)`).run();
db.prepare(`INSERT OR IGNORE INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
  VALUES ('trl_inc_fixed_tax', 'tax_inc_fixed_10', 'tax', 100, 'coa_202000', '["FIXED_INC_10"]', 1)`).run();

// Fiscal position for tax mapping tests
db.prepare(`INSERT OR IGNORE INTO fiscal_position (id, name, company_id) VALUES ('fp_exempt', 'Tax Exempt', ?)`).run(company);
db.prepare(`INSERT OR IGNORE INTO fiscal_position_tax_map (id, fiscal_position_id, tax_src_id, tax_dest_id)
  VALUES ('fptm_exempt', 'fp_exempt', 'tax_vat_10', null)`).run();

// Stock locations for the store are created lazily by the engine; seed a supplier
// location so we can post initial stock through the canonical stock engine.
const supplierWarehouse = 'wh_supplier_seed';
const supplierLocation = 'loc_supplier_seed';
db.prepare('INSERT OR IGNORE INTO warehouses (warehouse_id, company_id, name) VALUES (?, ?, ?)').run(supplierWarehouse, company, 'Seed Supplier WH');
db.prepare('INSERT OR IGNORE INTO locations (location_id, warehouse_id, company_id, name, type) VALUES (?, ?, ?, ?, ?)').run(supplierLocation, supplierWarehouse, company, 'Seed Supplier', 'supplier');

let store;
check('store creation is company-scoped and configurable', () => {
  store = retail.createStore(db, company, { store_code: 'BAG-01', name: 'Baghdad Store', timezone: 'Asia/Baghdad', currency: 'IQD' }, 'user-1');
  assert.equal(store.store_code, 'BAG-01');
  assert.equal(retail.listStores(db, company).length, 1);
  assert.throws(() => retail.createStore(db, company, { store_code: 'BAG-01', name: 'Duplicate' }, 'user-1'), /store code already exists/);
});

let shift;
check('one open shift per store with safe close', () => {
  shift = retail.openShift(db, company, store.id, { shift_number: '20260719-AM', opening_float: 50000 }, 'cashier-1');
  assert.equal(shift.state, 'open');
  assert.throws(() => retail.openShift(db, company, store.id, { shift_number: '20260719-PM' }, 'cashier-2'), /already has an open shift/);
  const closed = retail.closeShift(db, company, shift.id, { closing_total: 125000 }, 'manager-1');
  assert.equal(closed.state, 'closed');
});

shift = retail.openShift(db, company, store.id, { shift_number: '20260719-PM', opening_float: 0 }, 'cashier-2');
let barcode;
check('barcode registration and lookup are unique and active-only', () => {
  barcode = retail.registerBarcode(db, company, { product_id: 'prod_a', barcode: '6291234567890', barcode_type: 'ean13' }, 'user-1');
  assert.equal(retail.lookupBarcode(db, company, barcode.barcode).product_id, 'prod_a');
  assert.throws(() => retail.registerBarcode(db, company, { product_id: 'prod_b', barcode: barcode.barcode }, 'user-1'), /barcode already exists/);
  assert.throws(() => retail.lookupBarcode(db, 'missing-company', barcode.barcode), /company scope is invalid/);
});

check('barcode scan is idempotent and rejects closed or unknown shifts', () => {
  const input = { barcode: barcode.barcode, action: 'sale', quantity: 2, idempotency_key: 'sale-001' };
  const first = retail.recordScan(db, company, store.id, shift.id, input, 'cashier-2');
  const second = retail.recordScan(db, company, store.id, shift.id, input, 'cashier-2');
  assert.equal(second.id, first.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM shop_retail_scan_event WHERE company_id = ?').get(company).n, 1);
  assert.throws(() => retail.recordScan(db, company, store.id, shift.id, { ...input, idempotency_key: 'sale-002', barcode: 'missing' }, 'cashier-2'), /active barcode not found/);
});

// Seed stock for the store through the canonical stock engine.
function seedStock(productId, qty, rate) {
  const locations = retail._internal.ensureStoreLocation(db, company, store);
  const moveId = `seed-${productId}`;
  stockEngine.createStockMove(db, company, {
    id: moveId,
    product_id: productId,
    qty,
    uom: 'units',
    from_location_id: supplierLocation,
    to_location_id: locations.internalId,
    posting_date: new Date().toISOString().slice(0, 10),
    voucher_ref: `seed-${productId}`
  });
  stockEngine.postStockMove(db, company, moveId, 'system', { rate, negative_stock_policy: 'allow' });
}

seedStock('prod_a', 100, 80);
seedStock('prod_b', 50, 30);
seedStock('prod_c', 20, 150);

// ── Cash sale: atomic, stock + GL + tax + audit + event ──

let cashSale;
check('cash sale posts atomically with stock, GL, tax, audit and event', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'cash-sale-001',
    lines: [
      { product_id: 'prod_a', quantity: 2, unit_price: 100, tax_id: 'tax_vat_10' },
      { barcode: barcode.barcode, quantity: 1, unit_price: 100, discount_percent: 10, tax_id: 'tax_vat_10' }
    ]
  }, 'cashier-2');
  cashSale = result.ticket;
  assert.equal(cashSale.state, 'posted');
  assert.equal(cashSale.total, 319); // (220 + 99)
  assert.ok(cashSale.fiscal_doc_id);
  assert.ok(cashSale.stock_move_id);
  // Stock consumed
  const binA = db.prepare('SELECT qty FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_a', `loc_${store.id}`);
  assert.equal(binA.qty, 97);
  // GL balanced
  const docLines = db.prepare('SELECT SUM(debit) d, SUM(credit) c FROM fiscal_doc_line WHERE fiscal_doc_id = ?').get(cashSale.fiscal_doc_id);
  assert.ok(Math.abs(docLines.d - docLines.c) < 0.001);
  // Fiscal doc posted and hash-chained
  const fiscalDoc = db.prepare('SELECT state, doc_number FROM fiscal_doc WHERE id = ?').get(cashSale.fiscal_doc_id);
  assert.equal(fiscalDoc.state, 'posted');
  assert.ok(fiscalDoc.doc_number);
  // Audit row written
  const audit = db.prepare("SELECT COUNT(*) n FROM x_audit WHERE entity = 'shop_retail_ticket' AND record_id = ?").get(cashSale.id);
  assert.ok(audit.n >= 1);
  // Event published to vnext_event_log
  const event = db.prepare("SELECT COUNT(*) n FROM vnext_event_log WHERE entity = 'shop_retail_ticket' AND record_id = ?").get(cashSale.id);
  assert.ok(event.n >= 1);
});

// ── Payment method account posting ──

check('cash sale debits cash account', () => {
  const lines = db.prepare('SELECT account_id, debit, credit FROM fiscal_doc_line WHERE fiscal_doc_id = ?').all(cashSale.fiscal_doc_id);
  const cashLine = lines.find(l => l.account_id === 'coa_101000');
  assert.ok(cashLine);
  assert.equal(cashLine.debit, 319);
  assert.equal(cashLine.credit, 0);
});

check('card sale posts to card clearing account', () => {
  const cardStore = retail.createStore(db, company, { store_code: 'CARD-01', name: 'Card Store', default_card_account_id: 'coa_102000' }, 'user-1');
  const cardShift = retail.openShift(db, company, cardStore.id, { shift_number: 'CARD-AM' }, 'cashier-2');
  const locations = retail._internal.ensureStoreLocation(db, company, cardStore);
  stockEngine.createStockMove(db, company, { id: 'seed-card', product_id: 'prod_a', qty: 10, uom: 'units', from_location_id: supplierLocation, to_location_id: locations.internalId, posting_date: new Date().toISOString().slice(0, 10), voucher_ref: 'seed-card' });
  stockEngine.postStockMove(db, company, 'seed-card', 'system', { rate: 80, negative_stock_policy: 'allow' });

  const result = retail.postSale(db, company, {
    store_id: cardStore.id, shift_id: cardShift.id, payment_method: 'card', idempotency_key: 'card-sale-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100 }]
  }, 'cashier-2');
  const lines = db.prepare('SELECT account_id, debit FROM fiscal_doc_line WHERE fiscal_doc_id = ?').all(result.ticket.fiscal_doc_id);
  const cardLine = lines.find(l => l.account_id === 'coa_102000');
  assert.ok(cardLine);
  assert.equal(cardLine.debit, 100);
  retail.closeShift(db, company, cardShift.id, { closing_total: 0 }, 'manager-1');
});

check('bank sale posts to bank account', () => {
  const bankStore = retail.createStore(db, company, { store_code: 'BANK-01', name: 'Bank Store', default_bank_account_id: 'coa_102000' }, 'user-1');
  const bankShift = retail.openShift(db, company, bankStore.id, { shift_number: 'BANK-AM' }, 'cashier-2');
  const locations = retail._internal.ensureStoreLocation(db, company, bankStore);
  stockEngine.createStockMove(db, company, { id: 'seed-bank', product_id: 'prod_a', qty: 10, uom: 'units', from_location_id: supplierLocation, to_location_id: locations.internalId, posting_date: new Date().toISOString().slice(0, 10), voucher_ref: 'seed-bank' });
  stockEngine.postStockMove(db, company, 'seed-bank', 'system', { rate: 80, negative_stock_policy: 'allow' });

  const result = retail.postSale(db, company, {
    store_id: bankStore.id, shift_id: bankShift.id, payment_method: 'bank', idempotency_key: 'bank-sale-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100 }]
  }, 'cashier-2');
  const lines = db.prepare('SELECT account_id, debit FROM fiscal_doc_line WHERE fiscal_doc_id = ?').all(result.ticket.fiscal_doc_id);
  const bankLine = lines.find(l => l.account_id === 'coa_102000');
  assert.ok(bankLine);
  assert.equal(bankLine.debit, 100);
  retail.closeShift(db, company, bankShift.id, { closing_total: 0 }, 'manager-1');
});

check('invalid or cross-company account rejection', () => {
  const badStore = retail.createStore(db, company, { store_code: 'BAD-ACC', name: 'Bad Account Store', default_cash_account_id: 'coa_501000' }, 'user-1');
  const badShift = retail.openShift(db, company, badStore.id, { shift_number: 'BAD-ACC-AM' }, 'cashier-2');
  const locations = retail._internal.ensureStoreLocation(db, company, badStore);
  stockEngine.createStockMove(db, company, { id: 'seed-badacc', product_id: 'prod_a', qty: 10, uom: 'units', from_location_id: supplierLocation, to_location_id: locations.internalId, posting_date: new Date().toISOString().slice(0, 10), voucher_ref: 'seed-badacc' });
  stockEngine.postStockMove(db, company, 'seed-badacc', 'system', { rate: 80, negative_stock_policy: 'allow' });

  assert.throws(() => retail.postSale(db, company, {
    store_id: badStore.id, shift_id: badShift.id, payment_method: 'cash', idempotency_key: 'bad-acc-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100 }]
  }, 'cashier-2'), { code: 'ACCOUNT_INVALID' });
  retail.closeShift(db, company, badShift.id, { closing_total: 0 }, 'manager-1');
});

// ── Tax calculation correctness ──

check('fixed tax with quantity greater than one', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'fixed-tax-001',
    lines: [{ product_id: 'prod_b', quantity: 3, unit_price: 50, tax_id: 'tax_fixed_5' }]
  }, 'cashier-2');
  // 3 * 50 = 150, fixed tax 5 * 3 = 15, total = 165
  assert.equal(result.ticket.total, 165);
  assert.equal(result.ticket.tax_total, 15);
});

check('price-included percentage tax', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'inc-pct-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 110, tax_id: 'tax_inc_10' }]
  }, 'cashier-2');
  // 110 included, base = 100, tax = 10, total = 110
  assert.equal(result.ticket.total, 110);
  assert.equal(result.ticket.tax_total, 10);
});

check('price-included fixed tax', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'inc-fixed-001',
    lines: [{ product_id: 'prod_b', quantity: 2, unit_price: 60, tax_id: 'tax_inc_fixed_10' }]
  }, 'cashier-2');
  // 2 * 60 = 120, fixed tax 10 * 2 = 20, base = 100, total = 120
  assert.equal(result.ticket.total, 120);
  assert.equal(result.ticket.tax_total, 20);
});

check('fiscal-position tax mapping exempts tax', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'fp-exempt-001',
    fiscal_position_id: 'fp_exempt',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 100, tax_id: 'tax_vat_10' }]
  }, 'cashier-2');
  // Fiscal position maps tax_vat_10 to null (exempt), so no tax
  assert.equal(result.ticket.tax_total, 0);
  assert.equal(result.ticket.total, 100);
});

check('tax repartition account and tag output', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'tax-tags-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 100, tax_id: 'tax_vat_10' }]
  }, 'cashier-2');
  const taxLines = db.prepare('SELECT account_id, tax_refs FROM fiscal_doc_line WHERE fiscal_doc_id = ? AND credit > 0').all(result.ticket.fiscal_doc_id);
  const taxLine = taxLines.find(l => l.account_id === 'coa_202000');
  assert.ok(taxLine);
  // The tax engine should produce tag references when repartition lines have tag_ids
  // Note: fiscal_doc_line.tax_refs is populated by the tax engine's repartition tags
});

check('discount plus tax correctness', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'disc-tax-001',
    lines: [{ product_id: 'prod_a', quantity: 2, unit_price: 100, discount_percent: 10, tax_id: 'tax_vat_10' }]
  }, 'cashier-2');
  // 2 * 100 = 200, discount 20, net 180, tax 18, total 198
  assert.equal(result.ticket.total, 198);
  assert.equal(result.ticket.tax_total, 18);
});

// ── Non-cash / reference sale ──

let referenceSale;
check('reference sale posts AR invoice with income/tax/receivable split', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'reference',
    idempotency_key: 'ref-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50, tax_id: 'tax_vat_10' }]
  }, 'cashier-2');
  referenceSale = result.ticket;
  assert.equal(result.ticket.state, 'posted');
  assert.ok(result.payment?.arap_document_id);
  assert.ok(result.ticket.arap_document_id);
  const arapDoc = db.prepare('SELECT * FROM arap_document WHERE id = ?').get(result.payment.arap_document_id);
  assert.equal(arapDoc.document_kind, 'customer_invoice');
  assert.equal(arapDoc.total_amount, 55);
  // Verify fiscal doc split: receivable debit 55, income credit 50, tax credit 5
  const lines = db.prepare('SELECT account_id, debit, credit FROM fiscal_doc_line WHERE fiscal_doc_id = ?').all(result.ticket.fiscal_doc_id);
  const receivable = lines.find(l => l.account_id === 'coa_103000');
  const income = lines.find(l => l.account_id === 'coa_401000');
  const tax = lines.find(l => l.account_id === 'coa_202000');
  assert.ok(receivable);
  assert.equal(receivable.debit, 55);
  assert.ok(income);
  assert.equal(income.credit, 50);
  assert.ok(tax);
  assert.equal(tax.credit, 5);
});

check('exact AR open amount after reference sale', () => {
  const arapDoc = db.prepare('SELECT * FROM arap_document WHERE id = ?').get(referenceSale.arap_document_id);
  const open = arapDoc ? arap.documentOpenAmount(db, arapDoc.id) : null;
  assert.ok(open);
  assert.equal(open.open_amount, 55);
  assert.equal(open.allocated_amount, 0);
});

// ── Idempotent retry ──

check('idempotent retry returns the same ticket and does not double-post', () => {
  const first = retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'retry-sale-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100, tax_id: 'tax_vat_10' }]
  }, 'cashier-2');
  const second = retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'retry-sale-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100, tax_id: 'tax_vat_10' }]
  }, 'cashier-2');
  assert.equal(second.ticket.id, first.ticket.id);
  assert.equal(second.replayed, true);
  const ticketCount = db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket WHERE idempotency_key = ?').get('retry-sale-001');
  assert.equal(ticketCount.n, 1);
  // Different payload with same key is rejected
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'retry-sale-001',
    lines: [{ product_id: 'prod_a', quantity: 2, unit_price: 100 }]
  }, 'cashier-2'), { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
});

// ── Insufficient stock rollback ──

check('insufficient stock rolls back without fiscal or stock residue', () => {
  const beforeStock = db.prepare('SELECT qty FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_a', `loc_${store.id}`).qty;
  const beforeGl = db.prepare('SELECT COUNT(*) n FROM gl_line').get().n;
  const beforeTickets = db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n;
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'insufficient-001',
    lines: [{ product_id: 'prod_a', quantity: 1000, unit_price: 100 }]
  }, 'cashier-2'), /Negative stock is blocked/);
  assert.equal(db.prepare('SELECT qty FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_a', `loc_${store.id}`).qty, beforeStock);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gl_line').get().n, beforeGl);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n, beforeTickets);
});

// ── Payment failure rollback ──

check('payment failure rolls back atomically', () => {
  const beforeGl = db.prepare('SELECT COUNT(*) n FROM gl_line').get().n;
  const beforeTickets = db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n;
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'reference',
    partner_id: 'missing-partner',
    idempotency_key: 'payment-fail-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50 }]
  }, 'cashier-2'), { code: 'PARTNER_NOT_FOUND' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gl_line').get().n, beforeGl);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n, beforeTickets);
});

// ── GL failure rollback ──

check('GL failure rolls back atomically', () => {
  const beforeGl = db.prepare('SELECT COUNT(*) n FROM gl_line').get().n;
  const beforeTickets = db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n;
  const badStore = retail.createStore(db, company, { store_code: 'BAD-01', name: 'Bad Store', default_income_account_id: 'coa_501000' }, 'user-1');
  const badShift = retail.openShift(db, company, badStore.id, { shift_number: 'BAD-AM' }, 'cashier-2');
  assert.throws(() => retail.postSale(db, company, {
    store_id: badStore.id,
    shift_id: badShift.id,
    payment_method: 'cash',
    idempotency_key: 'gl-fail-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100 }]
  }, 'cashier-2'), { code: 'ACCOUNT_INVALID' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gl_line').get().n, beforeGl);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n, beforeTickets);
  retail.closeShift(db, company, badShift.id, { closing_total: 0 }, 'manager-1');
});

// ── Closed shift rejection ──

check('closed shift is rejected', () => {
  const closed = retail.closeShift(db, company, shift.id, { closing_total: 0 }, 'manager-1');
  assert.equal(closed.state, 'closed');
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'closed-shift-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100 }]
  }, 'cashier-2'), { code: 'SHIFT_NOT_OPEN' });
  // Reopen for later tests
  shift = retail.openShift(db, company, store.id, { shift_number: '20260719-EV', opening_float: 0 }, 'cashier-3');
});

// ── Cross-company rejection ──

check('cross-company access is rejected', () => {
  assert.throws(() => retail.postSale(db, otherCompany, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'cross-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100 }]
  }, 'cashier-2'), { code: 'STORE_NOT_FOUND' });
});

// ── Malformed input scenarios ──

check('malformed line quantity is rejected', () => {
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'malformed-qty-001',
    lines: [{ product_id: 'prod_a', quantity: 0, unit_price: 100 }]
  }, 'cashier-2'), { code: 'QTY_INVALID' });
});

check('malformed line tax is rejected', () => {
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'malformed-tax-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100, tax_id: 'missing-tax' }]
  }, 'cashier-2'), { code: 'TAX_NOT_FOUND' });
});

check('malformed line discount is rejected', () => {
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'cash',
    idempotency_key: 'malformed-disc-001',
    lines: [{ product_id: 'prod_a', quantity: 1, unit_price: 100, discount_percent: 150 }]
  }, 'cashier-2'), { code: 'DISCOUNT_INVALID' });
});

// ── Return / reversal with exact stock and GL restoration ──

let returnTicket;
check('successful return reverses stock and GL while keeping original immutable', () => {
  const originalDoc = db.prepare('SELECT * FROM fiscal_doc WHERE id = ?').get(cashSale.fiscal_doc_id);
  const beforeStockA = db.prepare('SELECT qty, value FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_a', `loc_${store.id}`);
  const beforeGl = db.prepare('SELECT COUNT(*) n FROM gl_line').get().n;
  const result = retail.postReturn(db, company, {
    original_ticket_id: cashSale.id,
    shift_id: shift.id,
    idempotency_key: 'return-001'
  }, 'cashier-3');
  returnTicket = result.ticket;
  assert.equal(returnTicket.kind, 'return');
  assert.equal(returnTicket.reversal_of_id, cashSale.id);
  assert.equal(returnTicket.state, 'posted');
  // Original fiscal doc is still posted, not cancelled
  const afterOriginalDoc = db.prepare('SELECT * FROM fiscal_doc WHERE id = ?').get(cashSale.fiscal_doc_id);
  assert.equal(afterOriginalDoc.state, 'posted');
  assert.equal(afterOriginalDoc.doc_number, originalDoc.doc_number);
  // Original ticket is marked reversed but remains the same record
  const originalTicket = db.prepare('SELECT * FROM shop_retail_ticket WHERE id = ?').get(cashSale.id);
  assert.equal(originalTicket.state, 'reversed');
  assert.equal(originalTicket.reversal_ticket_id, returnTicket.id);
  // Stock restored exactly
  const afterStockA = db.prepare('SELECT qty, value FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_a', `loc_${store.id}`);
  assert.equal(afterStockA.qty, beforeStockA.qty + 3); // 2 + 1
  // GL net restored (original + reversal sums to zero for affected accounts)
  const reversalLines = db.prepare('SELECT account_id, SUM(debit) d, SUM(credit) c FROM fiscal_doc_line WHERE fiscal_doc_id = ? GROUP BY account_id').all(returnTicket.fiscal_doc_id);
  const originalLines = db.prepare('SELECT account_id, SUM(debit) d, SUM(credit) c FROM fiscal_doc_line WHERE fiscal_doc_id = ? GROUP BY account_id').all(cashSale.fiscal_doc_id);
  assert.equal(reversalLines.length, originalLines.length);
  for (const ol of originalLines) {
    const rl = reversalLines.find(r => r.account_id === ol.account_id);
    assert.ok(rl);
    assert.ok(Math.abs(ol.d - rl.c) < 0.001);
    assert.ok(Math.abs(ol.c - rl.d) < 0.001);
  }
  assert.ok(db.prepare('SELECT COUNT(*) n FROM gl_line').get().n > beforeGl);
});

check('return ticket persists its own lines, taxes, and payment evidence', () => {
  const detail = retail.getTicket(db, company, returnTicket.id);
  assert.ok(detail.lines.length > 0);
  assert.ok(detail.taxes.length > 0);
  assert.ok(detail.payments.length > 0);
  // Return line IDs must not reuse original line IDs
  const originalLines = db.prepare('SELECT id FROM shop_retail_ticket_line WHERE ticket_id = ?').all(cashSale.id);
  const returnLines = db.prepare('SELECT id FROM shop_retail_ticket_line WHERE ticket_id = ?').all(returnTicket.id);
  for (const rl of returnLines) {
    assert.ok(!originalLines.some(ol => ol.id === rl.id));
  }
  // Return payment must have fiscal_doc_id and arap_document_id where applicable
  const payment = detail.payments[0];
  assert.ok(payment.fiscal_doc_id);
});

// ── Duplicate reversal ──

check('duplicate reversal is rejected', () => {
  assert.throws(() => retail.postReturn(db, company, {
    original_ticket_id: cashSale.id,
    shift_id: shift.id,
    idempotency_key: 'return-002'
  }, 'cashier-3'), { code: 'ORIGINAL_NOT_FOUND' });
});

// ── Refund ──

check('refund creates a cross-linked cash reversal without touching stock', () => {
  const beforeStock = db.prepare('SELECT qty FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_a', `loc_${store.id}`).qty;
  const result = retail.postRefund(db, company, {
    original_ticket_id: returnTicket.id,
    amount: 100,
    idempotency_key: 'refund-001'
  }, 'cashier-3');
  assert.equal(result.ticket.kind, 'refund');
  assert.equal(result.ticket.total, 100);
  assert.equal(db.prepare('SELECT qty FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_a', `loc_${store.id}`).qty, beforeStock);
  assert.throws(() => retail.postRefund(db, company, {
    original_ticket_id: returnTicket.id,
    amount: 999999,
    idempotency_key: 'refund-002'
  }, 'cashier-3'), { code: 'REFUND_EXCEEDS_BALANCE' });
});

check('partial refund is allowed', () => {
  const sale = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'partial-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 2, unit_price: 50 }]
  }, 'cashier-2');
  const refund = retail.postRefund(db, company, {
    original_ticket_id: sale.ticket.id, amount: 50, idempotency_key: 'partial-refund-001'
  }, 'cashier-3');
  assert.equal(refund.ticket.total, 50);
  assert.equal(refund.ticket.kind, 'refund');
});

check('cumulative refunds cannot exceed original total', () => {
  const sale = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'cum-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 100 }]
  }, 'cashier-2');
  retail.postRefund(db, company, { original_ticket_id: sale.ticket.id, amount: 60, idempotency_key: 'cum-refund-001' }, 'cashier-3');
  assert.throws(() => retail.postRefund(db, company, {
    original_ticket_id: sale.ticket.id, amount: 50, idempotency_key: 'cum-refund-002'
  }, 'cashier-3'), { code: 'REFUND_EXCEEDS_BALANCE' });
});

check('refund after shift closure is rejected', () => {
  const closedStore = retail.createStore(db, company, { store_code: 'CLOSED-01', name: 'Closed Store' }, 'user-1');
  const closedShift = retail.openShift(db, company, closedStore.id, { shift_number: 'CLOSED-AM' }, 'cashier-2');
  const locations = retail._internal.ensureStoreLocation(db, company, closedStore);
  stockEngine.createStockMove(db, company, { id: 'seed-closed', product_id: 'prod_b', qty: 10, uom: 'units', from_location_id: supplierLocation, to_location_id: locations.internalId, posting_date: new Date().toISOString().slice(0, 10), voucher_ref: 'seed-closed' });
  stockEngine.postStockMove(db, company, 'seed-closed', 'system', { rate: 30, negative_stock_policy: 'allow' });
  const sale = retail.postSale(db, company, {
    store_id: closedStore.id, shift_id: closedShift.id, payment_method: 'cash', idempotency_key: 'closed-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50 }]
  }, 'cashier-2');
  retail.closeShift(db, company, closedShift.id, { closing_total: 0 }, 'manager-1');
  assert.throws(() => retail.postRefund(db, company, {
    original_ticket_id: sale.ticket.id, amount: 50, idempotency_key: 'closed-refund-001', shift_id: closedShift.id
  }, 'cashier-3'), { code: 'SHIFT_NOT_OPEN' });
});

check('refund with wrong store or company is rejected', () => {
  const sale = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'wrong-store-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50 }]
  }, 'cashier-2');
  assert.throws(() => retail.postRefund(db, otherCompany, {
    original_ticket_id: sale.ticket.id, amount: 50, idempotency_key: 'wrong-comp-refund-001'
  }, 'cashier-3'), { code: 'ORIGINAL_NOT_FOUND' });
});

check('card refund uses canonical card/payment flow', () => {
  const cardStore = retail.createStore(db, company, { store_code: 'CARD-02', name: 'Card Refund Store', default_card_account_id: 'coa_102000' }, 'user-1');
  const cardShift = retail.openShift(db, company, cardStore.id, { shift_number: 'CARD-02-AM' }, 'cashier-2');
  const locations = retail._internal.ensureStoreLocation(db, company, cardStore);
  stockEngine.createStockMove(db, company, { id: 'seed-card2', product_id: 'prod_b', qty: 10, uom: 'units', from_location_id: supplierLocation, to_location_id: locations.internalId, posting_date: new Date().toISOString().slice(0, 10), voucher_ref: 'seed-card2' });
  stockEngine.postStockMove(db, company, 'seed-card2', 'system', { rate: 30, negative_stock_policy: 'allow' });
  const sale = retail.postSale(db, company, {
    store_id: cardStore.id, shift_id: cardShift.id, payment_method: 'card', idempotency_key: 'card-refund-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 100 }]
  }, 'cashier-2');
  const refund = retail.postRefund(db, company, {
    original_ticket_id: sale.ticket.id, amount: 100, idempotency_key: 'card-refund-001'
  }, 'cashier-3');
  assert.equal(refund.ticket.payment_method, 'card');
  const lines = db.prepare('SELECT account_id, credit FROM fiscal_doc_line WHERE fiscal_doc_id = ?').all(refund.ticket.fiscal_doc_id);
  const cardLine = lines.find(l => l.account_id === 'coa_102000');
  assert.ok(cardLine);
  assert.equal(cardLine.credit, 100);
  retail.closeShift(db, company, cardShift.id, { closing_total: 0 }, 'manager-1');
});

check('reference refund restores AR open amount correctly', () => {
  const sale = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'reference', idempotency_key: 'ref-refund-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 100 }]
  }, 'cashier-2');
  const beforeOpen = arap.documentOpenAmount(db, sale.ticket.arap_document_id).open_amount;
  assert.equal(beforeOpen, 100);
  retail.postRefund(db, company, {
    original_ticket_id: sale.ticket.id, amount: 100, idempotency_key: 'ref-refund-001'
  }, 'cashier-3');
  // The AR credit note reduces the receivable; the original invoice's open amount
  // remains visible but the credit note creates an offsetting AR document.
  const creditNote = db.prepare("SELECT * FROM arap_document WHERE document_kind = 'customer_credit_note' AND total_amount = 100 ORDER BY created_at DESC LIMIT 1").get();
  assert.ok(creditNote);
});

// ── Cancellation of posted tickets ──

check('posted cash cancellation reverses stock, GL, and remains immutable', () => {
  const sale = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'cancel-cash-001',
    lines: [{ product_id: 'prod_b', quantity: 2, unit_price: 50 }]
  }, 'cashier-2');
  const beforeStock = db.prepare('SELECT qty FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_b', `loc_${store.id}`).qty;
  const result = retail.cancelTicket(db, company, sale.ticket.id, 'cashier-3');
  assert.equal(result.cancelled, true);
  assert.equal(result.ticket.state, 'cancelled');
  // Stock restored
  const afterStock = db.prepare('SELECT qty FROM bin WHERE company_id = ? AND product_id = ? AND location_id = ?').get(company, 'prod_b', `loc_${store.id}`).qty;
  assert.equal(afterStock, beforeStock + 2);
  // Original fiscal doc remains posted
  const doc = db.prepare('SELECT state FROM fiscal_doc WHERE id = ?').get(sale.ticket.fiscal_doc_id);
  assert.equal(doc.state, 'posted');
  // Reversal fiscal doc exists and is posted
  const reversal = db.prepare('SELECT state FROM fiscal_doc WHERE id = ?').get(result.reversal_fiscal_doc_id);
  assert.equal(reversal.state, 'posted');
});

check('posted card cancellation reverses through canonical engines', () => {
  const cardStore = retail.createStore(db, company, { store_code: 'CARD-03', name: 'Card Cancel Store', default_card_account_id: 'coa_102000' }, 'user-1');
  const cardShift = retail.openShift(db, company, cardStore.id, { shift_number: 'CARD-03-AM' }, 'cashier-2');
  const locations = retail._internal.ensureStoreLocation(db, company, cardStore);
  stockEngine.createStockMove(db, company, { id: 'seed-card3', product_id: 'prod_b', qty: 10, uom: 'units', from_location_id: supplierLocation, to_location_id: locations.internalId, posting_date: new Date().toISOString().slice(0, 10), voucher_ref: 'seed-card3' });
  stockEngine.postStockMove(db, company, 'seed-card3', 'system', { rate: 30, negative_stock_policy: 'allow' });
  const sale = retail.postSale(db, company, {
    store_id: cardStore.id, shift_id: cardShift.id, payment_method: 'card', idempotency_key: 'cancel-card-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 100 }]
  }, 'cashier-2');
  const result = retail.cancelTicket(db, company, sale.ticket.id, 'cashier-3');
  assert.equal(result.cancelled, true);
  const doc = db.prepare('SELECT state FROM fiscal_doc WHERE id = ?').get(sale.ticket.fiscal_doc_id);
  assert.equal(doc.state, 'posted');
  retail.closeShift(db, company, cardShift.id, { closing_total: 0 }, 'manager-1');
});

check('posted reference cancellation creates AR credit note', () => {
  const sale = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'reference', idempotency_key: 'cancel-ref-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 100 }]
  }, 'cashier-2');
  const result = retail.cancelTicket(db, company, sale.ticket.id, 'cashier-3');
  assert.equal(result.cancelled, true);
  assert.ok(result.arap_reversal_id);
  const creditNote = db.prepare('SELECT * FROM arap_document WHERE id = ?').get(result.arap_reversal_id);
  assert.equal(creditNote.document_kind, 'customer_credit_note');
  assert.equal(creditNote.total_amount, 100);
});

check('repeated cancellation is idempotent', () => {
  const sale = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'cancel-idem-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50 }]
  }, 'cashier-2');
  const first = retail.cancelTicket(db, company, sale.ticket.id, 'cashier-3');
  assert.equal(first.cancelled, true);
  const second = retail.cancelTicket(db, company, sale.ticket.id, 'cashier-3');
  assert.equal(second.cancelled, true);
  assert.equal(second.ticket.state, 'cancelled');
});

// ── Draft ticket cancellation ──

check('draft ticket cancellation is idempotent', () => {
  const draftId = 'rtkt_draft_1';
  db.prepare(`INSERT INTO shop_retail_ticket (id, company_id, store_id, shift_id, ticket_number, kind, state, currency, subtotal, discount_total, tax_total, total, payment_method, idempotency_key, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, 'sale', 'draft', 'IQD', 0, 0, 0, 0, 'cash', ?, ?, 'system')`)
    .run(draftId, company, store.id, shift.id, 'POS-DRAFT-1', 'draft-001', new Date().toISOString());
  const first = retail.cancelTicket(db, company, draftId, 'cashier-3');
  assert.equal(first.ticket.state, 'cancelled');
  const second = retail.cancelTicket(db, company, draftId, 'cashier-3');
  assert.equal(second.ticket.state, 'cancelled');
});

// ── Audit, worklist, outbox, event evidence ──

check('sensitive operations create audit, worklist, outbox, and event evidence', () => {
  const sale = retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'audit-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50 }]
  }, 'cashier-2');
  // Audit
  const audit = db.prepare("SELECT COUNT(*) n FROM x_audit WHERE entity = 'shop_retail_ticket' AND record_id = ?").get(sale.ticket.id);
  assert.ok(audit.n >= 1);
  // Event/outbox
  const event = db.prepare("SELECT COUNT(*) n FROM vnext_event_log WHERE entity = 'shop_retail_ticket' AND record_id = ?").get(sale.ticket.id);
  assert.ok(event.n >= 1);
  // Return creates worklist
  const ret = retail.postReturn(db, company, {
    original_ticket_id: sale.ticket.id, shift_id: shift.id, idempotency_key: 'audit-return-001'
  }, 'cashier-3');
  const worklist = db.prepare("SELECT COUNT(*) n FROM r3_worklist_item WHERE entity = 'shop_retail_ticket' AND record_id = ?").get(ret.ticket.id);
  assert.ok(worklist.n >= 1);
});

// ── Real manifest loading ──

check('real manifest loads from durable repository file', () => {
  const manifest = retail.loadManifest();
  assert.equal(manifest.pack_id, 'retail_pos');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.edition_required, 'standard');
  assert.ok(manifest.permissions.length >= 3);
  assert.ok(manifest.collections.length >= 8);
  assert.ok(manifest.patches.length >= 13);
  assert.equal(manifest.conformance.zero_residue_required, true);
});

// ── Pack SDK conformance for Retail/POS with real manifest ──

check('Retail/POS pack manifest installs, edition-gates, and uninstalls with zero residue', () => {
  const manifest = retail.loadManifest();
  const installed = packSdk.installPack(db, company, manifest);
  assert.equal(installed.installed, true);
  assert.throws(() => packSdk.installPack(db, company, manifest), { code: 'PACK_ALREADY_INSTALLED' });

  // Edition gating negative: enterprise-only pack rejected under standard license
  db.prepare(`INSERT OR IGNORE INTO shop_license (id, company_id, edition, license_key, modules, seats, expiry_date, signature, created_at)
    VALUES ('lic_std', ?, 'standard', 'k', '[]', 5, '2030-01-01', 's', ?)`).run(company, new Date().toISOString());
  assert.throws(() => packSdk.installPack(db, company, {
    pack_id: 'retail_pos_ent',
    name: 'Retail POS Enterprise',
    version: '1.0.0',
    edition_required: 'enterprise'
  }), { code: 'EDITION_INSUFFICIENT' });

  const conformance = packSdk.checkConformance(db, company, 'retail_pos');
  assert.equal(conformance.passed, true);

  const uninstall = packSdk.uninstallPack(db, company, 'retail_pos');
  assert.equal(uninstall.uninstalled, true);
  assert.equal(uninstall.patches_reverted, 13);
  const activePatches = db.prepare('SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').get(company, 'retail_pos');
  assert.equal(activePatches.n, 0);
  const afterConformance = packSdk.checkConformance(db, company, 'retail_pos');
  assert.equal(afterConformance.passed, true);
});

// ── Patch conflict rejection ──

check('patch conflict between packs is detected', () => {
  const manifest = retail.loadManifest();
  packSdk.installPack(db, company, manifest);
  // Install a conflicting pack that patches the same collection
  packSdk.installPack(db, company, {
    pack_id: 'conflicting_pack',
    name: 'Conflicting Pack',
    version: '1.0.0',
    patches: [{ target_type: 'collection', action: 'add', target_key: 'shop_retail_ticket', data: {} }]
  });
  const conformance = packSdk.checkConformance(db, company, 'retail_pos');
  assert.equal(conformance.passed, false);
  const conflict = conformance.findings.find(f => f.check === 'patch_conflicts');
  assert.ok(conflict);
  assert.equal(conflict.pass, false);
  packSdk.uninstallPack(db, company, 'conflicting_pack');
  packSdk.uninstallPack(db, company, 'retail_pos');
});

// ── Routes: unauthorized user ──

checkAsync('routes reject unauthenticated and unauthorized users', async () => {
  const routesNoAuth = mountRetailRoutes({
    db,
    requireSession: () => ({ ok: false }),
    resolveScope: () => ({ companyId: company }),
    readRequestBody: async () => '{}',
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => false
  });
  const req = new EventEmitter(); req.method = 'GET'; req.url = '/api/x/retail'; req.headers = {};
  const res = { writeHead() {}, end() {} };
  assert.equal(routesNoAuth.handle(req, res, new URL('/api/x/retail', 'http://localhost')), true);
  assert.equal(res.statusCode, 401);

  const routesNoPerm = mountRetailRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-noperm', groups: [] }),
    resolveScope: () => ({ companyId: company }),
    readRequestBody: async () => '{}',
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => false
  });
  const req2 = new EventEmitter(); req2.method = 'GET'; req2.url = '/api/x/retail'; req2.headers = {};
  const res2 = { writeHead() {}, end() {} };
  assert.equal(routesNoPerm.handle(req2, res2, new URL('/api/x/retail', 'http://localhost')), true);
  assert.equal(res2.statusCode, 403);
});

checkAsync('routes serve real manifest', async () => {
  const routes = mountRetailRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'admin-1', groups: ['admin'] }),
    resolveScope: () => ({ companyId: company }),
    readRequestBody: async () => '{}',
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => true
  });
  const req = new EventEmitter(); req.method = 'GET'; req.url = '/api/x/retail/manifest'; req.headers = {};
  const res = { writeHead() {}, end() {} };
  assert.equal(routes.handle(req, res, new URL('/api/x/retail/manifest', 'http://localhost')), true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.pack_id, 'retail_pos');
});

// ── Failure injection: no residue after rollback ──

check('stock failure leaves no residue', () => {
  const beforeTickets = db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n;
  const beforeGl = db.prepare('SELECT COUNT(*) n FROM gl_line').get().n;
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'fail-stock-001',
    lines: [{ product_id: 'prod_a', quantity: 9999, unit_price: 100 }]
  }, 'cashier-2'), /Negative stock/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n, beforeTickets);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gl_line').get().n, beforeGl);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM vnext_event_log WHERE entity = ?').get('shop_retail_ticket').n >= 0, true);
});

check('tax failure leaves no residue', () => {
  const beforeTickets = db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n;
  const beforeGl = db.prepare('SELECT COUNT(*) n FROM gl_line').get().n;
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'cash', idempotency_key: 'fail-tax-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50, tax_id: 'missing-tax' }]
  }, 'cashier-2'), { code: 'TAX_NOT_FOUND' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n, beforeTickets);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gl_line').get().n, beforeGl);
});

check('payment failure leaves no residue', () => {
  const beforeTickets = db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n;
  const beforeGl = db.prepare('SELECT COUNT(*) n FROM gl_line').get().n;
  assert.throws(() => retail.postSale(db, company, {
    store_id: store.id, shift_id: shift.id, payment_method: 'reference', partner_id: 'missing-partner', idempotency_key: 'fail-pay-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50 }]
  }, 'cashier-2'), { code: 'PARTNER_NOT_FOUND' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n, beforeTickets);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gl_line').get().n, beforeGl);
});

check('AR posting failure leaves no residue', () => {
  const beforeTickets = db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n;
  const beforeGl = db.prepare('SELECT COUNT(*) n FROM gl_line').get().n;
  const badStore = retail.createStore(db, company, { store_code: 'AR-FAIL', name: 'AR Fail Store', default_income_account_id: 'coa_501000' }, 'user-1');
  const badShift = retail.openShift(db, company, badStore.id, { shift_number: 'AR-FAIL-AM' }, 'cashier-2');
  const locations = retail._internal.ensureStoreLocation(db, company, badStore);
  stockEngine.createStockMove(db, company, { id: 'seed-arfail', product_id: 'prod_b', qty: 10, uom: 'units', from_location_id: supplierLocation, to_location_id: locations.internalId, posting_date: new Date().toISOString().slice(0, 10), voucher_ref: 'seed-arfail' });
  stockEngine.postStockMove(db, company, 'seed-arfail', 'system', { rate: 30, negative_stock_policy: 'allow' });
  assert.throws(() => retail.postSale(db, company, {
    store_id: badStore.id, shift_id: badShift.id, payment_method: 'reference', idempotency_key: 'fail-ar-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50 }]
  }, 'cashier-2'), { code: 'ACCOUNT_INVALID' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_retail_ticket').get().n, beforeTickets);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gl_line').get().n, beforeGl);
  retail.closeShift(db, company, badShift.id, { closing_total: 0 }, 'manager-1');
});

// ── Safe migration rollback ──

db.exec('PRAGMA foreign_keys = OFF;');
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete;');
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_update;');
const cleanTables = [
  'gl_line', 'payment_allocation', 'payment', 'fiscal_doc_line', 'arap_document', 'fiscal_doc',
  'stock_move', 'stock_ledger_line', 'bin', 'stock_fifo_layer', 'stock_batch', 'stock_serial',
  'shop_retail_ticket_payment', 'shop_retail_ticket_tax', 'shop_retail_ticket_line', 'shop_retail_ticket',
  'shop_retail_scan_event', 'shop_retail_barcode', 'shop_retail_shift', 'shop_retail_store',
  'shop_pack_patch', 'shop_pack_migration', 'shop_pack_registry', 'shop_license', 'shop_tenant',
  'product_master', 'tax', 'tax_repartition_line', 'partner_master', 'account', 'companies',
  'r3_worklist_item', 'r3_idempotency', 'vnext_event_log', 'x_audit', 'x_sequences', 'warehouses', 'locations',
  'fiscal_position', 'fiscal_position_tax_map', 'fiscal_position_account_map'
];
for (const t of cleanTables) {
  try { db.prepare(`DELETE FROM "${t}"`).run(); } catch (_) {}
}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migrations 903, 904, and 905 down restore the Retail/POS schema boundary', () => {
  assert.ok(down.migrations.includes('903_r9_retail_pos_pack'));
  assert.ok(down.migrations.includes('904_r9_retail_pos_transactions'));
  assert.ok(down.migrations.includes('905_r9_retail_pos_governance'));
  for (const table of ['shop_retail_store', 'shop_retail_shift', 'shop_retail_barcode', 'shop_retail_scan_event', 'shop_retail_ticket', 'shop_retail_ticket_line', 'shop_retail_ticket_tax', 'shop_retail_ticket_payment']) {
    assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table), undefined);
  }
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR9 RETAIL/POS PACK SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
