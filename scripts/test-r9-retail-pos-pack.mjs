// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.3 (proprietary self, not copied)
// R9.3 focused acceptance: disposable DB only. Proves the governed Retail/POS
// transaction adapter: atomic sale posting, canonical stock/GL/payment/tax
// integration, return/refund/cancellation reversal, idempotency, ACL, company
// scope, Pack SDK conformance, and safe migration rollback.
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

db.prepare(`INSERT OR IGNORE INTO tax (id, name, company_id, tax_group_id, amount_type, amount, price_include, type_tax_use, active)
  VALUES ('tax_vat_10', 'VAT 10%', ?, null, 'percent', 10, 0, 'sale', 1)`).run(company);

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

// ── Non-cash / reference sale ──

check('reference sale posts AR invoice and fiscal document', () => {
  const result = retail.postSale(db, company, {
    store_id: store.id,
    shift_id: shift.id,
    payment_method: 'reference',
    idempotency_key: 'ref-sale-001',
    lines: [{ product_id: 'prod_b', quantity: 1, unit_price: 50, tax_id: 'tax_vat_10' }]
  }, 'cashier-2');
  assert.equal(result.ticket.state, 'posted');
  assert.ok(result.payment?.arap_document_id);
  const arapDoc = db.prepare('SELECT * FROM arap_document WHERE id = ?').get(result.payment.arap_document_id);
  assert.equal(arapDoc.document_kind, 'customer_invoice');
  assert.equal(arapDoc.total_amount, 55);
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
  // Force a GL imbalance by using a store with a broken income account that cannot resolve.
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
  }, 'cashier-3'), { code: 'REFUND_EXCEEDS_TOTAL' });
});

// ── Cancellation of a draft ticket ──

check('draft ticket cancellation is idempotent', () => {
  // Build a draft by injecting a ticket row directly (posted sales are covered above).
  const draftId = 'rtkt_draft_1';
  db.prepare(`INSERT INTO shop_retail_ticket (id, company_id, store_id, shift_id, ticket_number, kind, state, currency, subtotal, discount_total, tax_total, total, payment_method, idempotency_key, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, 'sale', 'draft', 'IQD', 0, 0, 0, 0, 'cash', ?, ?, 'system')`)
    .run(draftId, company, store.id, shift.id, 'POS-DRAFT-1', 'draft-001', new Date().toISOString());
  const first = retail.cancelTicket(db, company, draftId, 'cashier-3');
  assert.equal(first.ticket.state, 'cancelled');
  const second = retail.cancelTicket(db, company, draftId, 'cashier-3');
  assert.equal(second.ticket.state, 'cancelled');
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

// ── Pack SDK conformance for Retail/POS ──

check('Retail/POS pack manifest installs, edition-gates, and uninstalls with zero residue', () => {
  const manifest = {
    pack_id: 'retail_pos',
    name: 'Retail/POS Pack',
    version: '1.0.0',
    description: 'Governed Retail/POS transactions with canonical stock/GL/payment/tax integration',
    author: 'Octagon',
    edition_required: 'standard',
    patches: [
      { target_type: 'collection', action: 'add', target_key: 'shop_retail_ticket', data: {} },
      { target_type: 'collection', action: 'add', target_key: 'shop_retail_ticket_line', data: {} },
      { target_type: 'permission', action: 'add', target_key: 'retail:manage', data: {} }
    ]
  };
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
  assert.equal(uninstall.patches_reverted, 3);
  const activePatches = db.prepare('SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').get(company, 'retail_pos');
  assert.equal(activePatches.n, 0);
  const afterConformance = packSdk.checkConformance(db, company, 'retail_pos');
  assert.equal(afterConformance.passed, true);
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
  'r3_worklist_item', 'r3_idempotency', 'vnext_event_log', 'x_audit', 'x_sequences', 'warehouses', 'locations'
];
for (const t of cleanTables) {
  try { db.prepare(`DELETE FROM "${t}"`).run(); } catch (_) {}
}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 903 down restores the Retail/POS schema boundary', () => {
  assert.ok(down.migrations.includes('903_r9_retail_pos_pack'));
  for (const table of ['shop_retail_store', 'shop_retail_shift', 'shop_retail_barcode', 'shop_retail_scan_event', 'shop_retail_ticket', 'shop_retail_ticket_line', 'shop_retail_ticket_tax', 'shop_retail_ticket_payment']) {
    assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table), undefined);
  }
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR9 RETAIL/POS PACK SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
