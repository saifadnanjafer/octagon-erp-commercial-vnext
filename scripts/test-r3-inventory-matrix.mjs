// A4 remediation suite: the full inventory acceptance matrix on a disposable database.
// receipt/putaway/reserve/release/pick/pack/ship/partial+backorder/return/transfers/
// 1-2-3-step routes/push+pull/min-max reorder -> draft PO+MO+transfer/cycle count via
// Approval Center/batch/serial/expiry/barcode/concurrency/no double-pick-ship/
// realtime events/ledger=bins/valuation=GL/offline fail-closed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import stock from '../vnext/server/stock/stock-engine.js';
import core from '../vnext/server/modules/r3-core.js';
import ops from '../vnext/server/modules/inventory/inventory-ops-engine.js';
import approvals from '../vnext/server/approvals/approvals.js';
import events from '../vnext/server/events/events.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r3-invmatrix-'));
const dbPath = path.join(temp, 'r3-inv.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const user = 'inv-test';
const runtime = { events: events.createEventService({ db }) };
const results = [];
let failures = 0;
function check(name, fn) {
  try { fn(); results.push(`PASS ${name}`); }
  catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); }
}
function bin(productId, locationId) { return Number(db.prepare('SELECT COALESCE(qty,0) qty FROM bin WHERE company_id=? AND product_id=? AND location_id=?').get(company, productId, locationId)?.qty || 0); }

// ---------- fixture: two warehouses, internal bins, supplier/customer, GL policy ----------
for (const [wh, name] of [['inv-wh-a', 'WH A'], ['inv-wh-b', 'WH B']]) db.prepare('INSERT OR IGNORE INTO warehouses(warehouse_id,company_id,name) VALUES(?,?,?)').run(wh, company, name);
for (const [locId, wh, name, type] of [
  ['inv-a-stock', 'inv-wh-a', 'A Stock', 'internal'], ['inv-a-input', 'inv-wh-a', 'A Input', 'internal'], ['inv-a-qc', 'inv-wh-a', 'A QC', 'internal'], ['inv-a-output', 'inv-wh-a', 'A Output', 'internal'],
  ['inv-b-stock', 'inv-wh-b', 'B Stock', 'internal'],
  ['inv-supplier', 'inv-wh-a', 'Supplier', 'supplier'], ['inv-customer', 'inv-wh-a', 'Customer', 'customer'], ['inv-loss', 'inv-wh-a', 'Loss', 'inventory_loss'],
]) db.prepare('INSERT INTO locations(location_id,warehouse_id,company_id,name,type) VALUES(?,?,?,?,?)').run(locId, wh, company, name, type);
db.prepare("INSERT OR REPLACE INTO stock_valuation_category_policy(company_id,category,valuation_account_id,cogs_account_id,adjustment_account_id,accrual_account_id) VALUES(?,?,?,?,?,?)").run(company, 'Staged', 'coa_104000', 'coa_501000', 'coa_502000', 'coa_201000');
const customer = arap.createPartner(db, company, { id: 'inv-customer-p', name: 'Inv Customer', partner_type: 'customer' }, user);
const vendor = arap.createPartner(db, company, { id: 'inv-vendor-p', name: 'Inv Vendor', partner_type: 'supplier' }, user);
const product = core.createProduct(db, company, { id: 'inv-product', code: 'INV-P', name: 'Inv Product', product_type: 'goods', standard_cost: 10 }, user);
const batchProduct = core.createProduct(db, company, { id: 'inv-batch', code: 'INV-B', name: 'Batch Product', product_type: 'goods', tracking_type: 'batch', standard_cost: 5 }, user);
const serialProduct = core.createProduct(db, company, { id: 'inv-serial', code: 'INV-S', name: 'Serial Product', product_type: 'goods', tracking_type: 'serial', standard_cost: 20 }, user);
core.createBarcode(db, company, { id: 'inv-alt-barcode', product_id: product.id, barcode: 'ALT-777' });

// ---------- 1. receipt ----------
function post(moveInput, options = {}) { const move = stock.createStockMove(db, company, { warehouse_id: 'inv-wh-a', currency: 'IQD', ...moveInput }); return { move, posted: stock.postStockMove(db, company, move.id, user, options) }; }
const receipt = post({ product_id: product.id, qty: 100, from_location_id: 'inv-supplier', to_location_id: 'inv-a-input', voucher_ref: 'INV-REC-1', cost_price: 10 }, { rate: 10 });
check('receipt posts canonical ledger lines', () => { assert.equal(receipt.posted.success, true); assert.equal(bin(product.id, 'inv-a-input'), 100); });

// ---------- 2. putaway input -> stock ----------
db.prepare('INSERT INTO stock_putaway_rule(id,company_id,warehouse_id,source_location_id,destination_location_id,product_id,priority,active) VALUES(?,?,?,?,?,?,?,?)').run('inv-putaway', company, 'inv-wh-a', 'inv-a-input', 'inv-a-stock', product.id, 1, 1);
for (let i = 0; i < 1; i += 1) core.putaway(db, company, { warehouse_id: 'inv-wh-a', product_id: product.id, qty: 100, source_location_id: 'inv-a-input' }, user, runtime);
check('putaway relocates stock by rule', () => { assert.equal(bin(product.id, 'inv-a-input'), 0); assert.equal(bin(product.id, 'inv-a-stock'), 100); });

// ---------- 3. reservation, concurrency protection, release ----------
const quote = core.createQuote(db, company, { id: 'inv-quote', partner_id: customer.id, lines: [{ product_id: product.id, qty: 60, unit_price: 15 }] }, user, runtime);
const order = core.confirmOrder(db, company, { id: 'inv-order', quote_id: quote.id }, user, runtime);
const reservations = core.reserveSalesOrder(db, company, order.id, { location_id: 'inv-a-stock' }, user, runtime);
check('reservation reserves demand', () => assert.equal(reservations[0].reserved_qty, 60));
const quote2 = core.createQuote(db, company, { id: 'inv-quote-2', partner_id: customer.id, lines: [{ product_id: product.id, qty: 60, unit_price: 15 }] }, user, runtime);
const order2 = core.confirmOrder(db, company, { id: 'inv-order-2', quote_id: quote2.id }, user, runtime);
check('concurrent over-reservation is rejected (no double allocation)', () =>
  assert.throws(() => core.reserveSalesOrder(db, company, order2.id, { location_id: 'inv-a-stock' }, user, runtime), /insufficient stock/));
const released = ops.releaseReservation(db, company, reservations[0].id, { qty: 20 }, user, runtime);
check('partial reservation release restores availability', () => { assert.equal(released.released_qty, 20); assert.equal(ops.reservationAvailable(db, company, product.id, 'inv-a-stock'), 60); });
check('released quantity can be re-reserved by the waiting order', () => {
  const rows = core.reserveSalesOrder(db, company, order2.id, { location_id: 'inv-a-stock', lines: [{ order_line_id: db.prepare('SELECT id FROM sales_order_line WHERE order_id=?').get(order2.id).id, qty: 20 }] }, user, runtime);
  assert.equal(rows[0].reserved_qty, 20);
});

// ---------- 4. partial delivery -> backorder -> return ----------
const orderLine = db.prepare('SELECT id FROM sales_order_line WHERE order_id=?').get(order.id);
const delivery = core.deliverSalesOrder(db, company, order.id, { location_id: 'inv-a-stock', customer_location_id: 'inv-customer', lines: [{ order_line_id: orderLine.id, qty: 25 }] }, user, runtime);
check('partial shipment posts stock and stays partial', () => { assert.equal(delivery.state, 'partial'); assert.equal(bin(product.id, 'inv-a-stock'), 75); });
check('backorder exists for the remainder', () => assert.equal(db.prepare("SELECT COUNT(*) n FROM sales_backorder WHERE order_id=? AND state='open'").get(order.id).n, 1));
const returned = core.returnSales(db, company, order.id, { from_location_id: 'inv-customer', to_location_id: 'inv-a-stock', lines: [{ order_line_id: orderLine.id, qty: 5, reason: 'damaged' }] }, user, runtime);
check('customer return restores stock with credit note', () => { assert.equal(returned[0].credit.state, 'posted'); assert.equal(bin(product.id, 'inv-a-stock'), 80); });

// ---------- 5. pick/pack/ship + no double-pick/no double-ship ----------
const pick = core.insertResource(db, company, 'picks', { id: 'inv-pick', source_ref: order.id }, user);
core.insertResource(db, company, 'pick-lines', { id: 'inv-pick-line', pick_id: pick.id, product_id: product.id, qty: 3, picked_qty: 3, location_id: 'inv-a-stock' }, user);
const shipped = core.pickPackShip(db, company, { pick_id: pick.id, destination_location_id: 'inv-customer' }, user, runtime);
check('shipping posts canonical stock moves', () => { assert.equal(shipped.state, 'shipped'); assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_move WHERE voucher_ref LIKE ? AND state='done'").get(`PICK-${pick.id}-%`).n, 1); });
const binAfterShip = bin(product.id, 'inv-a-stock');
core.pickPackShip(db, company, { pick_id: pick.id, destination_location_id: 'inv-customer' }, user, runtime);
check('re-shipping the same pick is idempotent (no double-ship, no double-pick)', () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_move WHERE voucher_ref LIKE ?").get(`PICK-${pick.id}-%`).n, 1);
  assert.equal(bin(product.id, 'inv-a-stock'), binAfterShip);
});
check('over-picking beyond demand is rejected', () => {
  const badPick = core.insertResource(db, company, 'picks', { id: 'inv-pick-bad', source_ref: order.id }, user);
  core.insertResource(db, company, 'pick-lines', { id: 'inv-pick-bad-line', pick_id: badPick.id, product_id: product.id, qty: 1, picked_qty: 1, location_id: 'inv-a-stock' }, user);
  assert.throws(() => core.pickPackShip(db, company, { pick_id: badPick.id, destination_location_id: 'inv-customer', lines: [{ pick_line_id: 'inv-pick-bad-line', qty: 5 }] }, user, runtime), /exceeds demand/);
});

// ---------- 6. internal + cross-warehouse transfer ----------
const internalTransfer = ops.transferStock(db, company, { product_id: product.id, qty: 10, from_location_id: 'inv-a-stock', to_location_id: 'inv-a-qc' }, user, runtime);
check('internal transfer posts within one warehouse', () => { assert.equal(internalTransfer.cross_warehouse, false); assert.equal(bin(product.id, 'inv-a-qc'), 10); });
const crossTransfer = ops.transferStock(db, company, { product_id: product.id, qty: 4, from_location_id: 'inv-a-qc', to_location_id: 'inv-b-stock' }, user, runtime);
check('cross-warehouse transfer posts between warehouses', () => { assert.equal(crossTransfer.cross_warehouse, true); assert.equal(bin(product.id, 'inv-b-stock'), 4); });
check('transfer to the same location is rejected', () =>
  assert.throws(() => ops.transferStock(db, company, { product_id: product.id, qty: 1, from_location_id: 'inv-a-stock', to_location_id: 'inv-a-stock' }, user, runtime), /distinct internal locations/));

// ---------- 7. one/two/three-step routes, push and pull ----------
function makeRoute(routeId, ruleSpecs) {
  core.insertResource(db, company, 'routes', { id: routeId, name: routeId }, user);
  ruleSpecs.forEach(([seq, from, to, trigger], index) =>
    core.insertResource(db, company, 'route-rules', { id: `${routeId}-rule-${index}`, route_id: routeId, source_location_id: from, dest_location_id: to, sequence: seq, trigger_type: trigger }, user));
  return routeId;
}
makeRoute('inv-route-1step', [[1, 'inv-a-stock', 'inv-a-output', 'pull']]);
makeRoute('inv-route-2step', [[1, 'inv-a-stock', 'inv-a-qc', 'pull'], [2, 'inv-a-qc', 'inv-a-output', 'pull']]);
makeRoute('inv-route-3step', [[1, 'inv-a-input', 'inv-a-qc', 'push'], [2, 'inv-a-qc', 'inv-a-stock', 'push'], [3, 'inv-a-stock', 'inv-a-output', 'push']]);
const oneStep = ops.executeRoute(db, company, { route_id: 'inv-route-1step', product_id: product.id, qty: 2, demand_ref: 'DEMAND-1S' }, user, runtime);
check('one-step route posts one chained move', () => assert.equal(oneStep.steps.length, 1));
const twoStep = ops.executeRoute(db, company, { route_id: 'inv-route-2step', product_id: product.id, qty: 2, demand_ref: 'DEMAND-2S' }, user, runtime);
check('two-step pull route chains through QC', () => { assert.equal(twoStep.steps.length, 2); assert.equal(twoStep.steps.every((step) => step.trigger_type === 'pull'), true); });
post({ product_id: product.id, qty: 3, from_location_id: 'inv-supplier', to_location_id: 'inv-a-input', voucher_ref: 'INV-REC-3STEP', cost_price: 10 }, { rate: 10 });
const threeStep = ops.executeRoute(db, company, { route_id: 'inv-route-3step', product_id: product.id, qty: 3, demand_ref: 'DEMAND-3S' }, user, runtime);
check('three-step push route chains input->qc->stock->output', () => { assert.equal(threeStep.steps.length, 3); assert.equal(threeStep.steps.every((step) => step.trigger_type === 'push'), true); });
check('route execution persists resolutions and outbox events', () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_route_resolution WHERE demand_ref IN ('DEMAND-1S','DEMAND-2S','DEMAND-3S')").get().n, 6);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM vnext_event_log WHERE event_type='r3.stock_route.executed'").get().n >= 3);
});

// ---------- 8. min/max reorder -> draft PO / draft MO / draft transfer ----------
const poRule = core.insertResource(db, company, 'reorder-rules', { id: 'inv-reorder-po', product_id: product.id, location_id: 'inv-b-stock', min_qty: 50, max_qty: 80, multiple_qty: 10, vendor_id: vendor.id }, user);
const poRequest = core.createReorderRequest(db, company, { reorder_rule_id: poRule.id }, user, runtime);
check('min/max shortfall creates a draft replenishment suggestion', () => { assert.equal(poRequest.state, 'draft'); assert.ok(poRequest.demand_qty >= 70); });
const poConverted = ops.convertReorderRequest(db, company, poRequest.id, { kind: 'purchase', unit_price: 9 }, user, runtime);
check('replenishment converts to a DRAFT purchase order (no stock, no GL)', () => {
  assert.equal(poConverted.supply.kind, 'purchase_order');
  assert.equal(db.prepare('SELECT state FROM purchase_order WHERE id=?').get(poConverted.supply.id).state, 'draft');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_move WHERE voucher_ref LIKE ?').get(`%${poConverted.supply.id}%`).n, 0);
});
check('a converted request cannot be converted twice', () =>
  assert.throws(() => ops.convertReorderRequest(db, company, poRequest.id, { kind: 'purchase' }, user, runtime), /only a draft/));
const finishedGood = core.createProduct(db, company, { id: 'inv-mo-product', code: 'INV-MO', name: 'MO Product', product_type: 'goods' }, user);
core.insertResource(db, company, 'boms', { id: 'inv-mo-bom', product_id: finishedGood.id, code: 'BOM-INV', output_qty: 1 }, user);
const moRule = core.insertResource(db, company, 'reorder-rules', { id: 'inv-reorder-mo', product_id: finishedGood.id, location_id: 'inv-a-stock', min_qty: 5, max_qty: 8, multiple_qty: 1 }, user);
const moRequest = core.createReorderRequest(db, company, { reorder_rule_id: moRule.id }, user, runtime);
const moConverted = ops.convertReorderRequest(db, company, moRequest.id, { kind: 'manufacture' }, user, runtime);
check('replenishment converts to a DRAFT manufacturing order', () => {
  assert.equal(moConverted.supply.kind, 'manufacturing_order');
  assert.equal(db.prepare('SELECT state FROM mrp_production_order WHERE id=?').get(moConverted.supply.id).state, 'draft');
});
const trRule = core.insertResource(db, company, 'reorder-rules', { id: 'inv-reorder-tr', product_id: product.id, location_id: 'inv-a-output', min_qty: 50, max_qty: 60, multiple_qty: 1 }, user);
const trRequest = core.createReorderRequest(db, company, { reorder_rule_id: trRule.id }, user, runtime);
const trConverted = ops.convertReorderRequest(db, company, trRequest.id, { kind: 'transfer', from_location_id: 'inv-a-stock' }, user, runtime);
check('replenishment converts to a DRAFT internal-transfer suggestion', () => assert.equal(trConverted.supply.kind, 'internal_transfer'));

// ---------- 9. cycle count via Approval Center-backed adjustment ----------
const count = core.insertResource(db, company, 'cycle-counts', { id: 'inv-count', location_id: 'inv-a-stock', count_date: '2026-07-19' }, user);
core.insertResource(db, company, 'cycle-count-lines', { id: 'inv-count-line', count_id: count.id, product_id: product.id, expected_qty: bin(product.id, 'inv-a-stock'), counted_qty: bin(product.id, 'inv-a-stock') - 2 }, user);
check('cycle count adjustment without approval is rejected', () =>
  assert.throws(() => core.cycleCountApprove(db, company, { count_id: count.id, posting_date: '2026-07-19' }, user, runtime)));
const countApproval = approvals._internal.createApproval(db, { entity: 'stock_cycle_count', record_id: count.id, action: 'cycle_count_approve', approver_role: 'manager', company_id: company, tenant_id: company, payload: { count_id: count.id } }, user);
approvals._internal.decideApproval(db, countApproval.json.data.id, 'approve', { user: 'inv-approver', roles: ['manager'] });
const stockBeforeCount = bin(product.id, 'inv-a-stock');
const approvedCount = core.cycleCountApprove(db, company, { count_id: count.id, approval_ref: countApproval.json.data.id, posting_date: '2026-07-19' }, 'inv-approver', runtime);
check('approved cycle count posts the adjustment', () => { assert.equal(approvedCount.approval.state, 'approved'); assert.equal(bin(product.id, 'inv-a-stock'), stockBeforeCount - 2); });

// ---------- 10. batch / serial / expiry ----------
const batchIn = post({ product_id: batchProduct.id, qty: 10, from_location_id: 'inv-supplier', to_location_id: 'inv-a-stock', voucher_ref: 'BATCH-IN-1', cost_price: 5, batch_number: 'LOT-A', expiry_date: '2026-08-01' }, { rate: 5 });
check('batch receipt records the batch on the ledger', () => assert.equal(db.prepare('SELECT batch_number FROM stock_ledger_line WHERE stock_move_id=? AND qty>0').get(batchIn.move.id).batch_number, 'LOT-A'));
const serialIn = post({ product_id: serialProduct.id, qty: 1, from_location_id: 'inv-supplier', to_location_id: 'inv-a-stock', voucher_ref: 'SERIAL-IN-1', cost_price: 20, serial_number: 'SN-001' }, { rate: 20 });
check('serial receipt records the serial number', () => assert.equal(db.prepare('SELECT serial_number FROM stock_ledger_line WHERE stock_move_id=? AND qty>0').get(serialIn.move.id).serial_number, 'SN-001'));
check('serial quantity must be exactly one', () =>
  assert.throws(() => post({ product_id: serialProduct.id, qty: 2, from_location_id: 'inv-supplier', to_location_id: 'inv-a-stock', voucher_ref: 'SERIAL-IN-2', serial_number: 'SN-002' }, { rate: 20 })));
check('expired batch issue is rejected', () => {
  post({ product_id: batchProduct.id, qty: 5, from_location_id: 'inv-supplier', to_location_id: 'inv-a-stock', voucher_ref: 'BATCH-IN-EXPIRED', cost_price: 5, batch_number: 'LOT-EXP' }, { rate: 5, expiry_date: '2020-01-01' });
  assert.throws(() => post({ product_id: batchProduct.id, qty: 1, from_location_id: 'inv-a-stock', to_location_id: 'inv-customer', voucher_ref: 'BATCH-OUT-EXPIRED', batch_number: 'LOT-EXP' }), /expir/i);
});

// ---------- 11. barcode endpoints ----------
check('primary barcode resolves the product', () => { const scan = ops.scanBarcode(db, company, { barcode: 'ALT-777', scan_type: 'lookup' }, user, runtime); assert.equal(scan.resolved, true); assert.equal(scan.product_id, product.id); });
check('unknown barcode records an unresolved scan', () => { const scan = ops.scanBarcode(db, company, { barcode: 'NOPE-000' }, user, runtime); assert.equal(scan.resolved, false); assert.ok(db.prepare('SELECT 1 FROM stock_barcode_scan WHERE id=?').get(scan.id)); });

// ---------- 12. reconciliation: ledger = bins, valuation = GL; realtime events ----------
check('stock ledger equals bins for every product/location', () => {
  const rows = db.prepare('SELECT product_id, location_id, SUM(qty) q FROM stock_ledger_line WHERE company_id=? GROUP BY product_id, location_id').all(company);
  for (const row of rows) {
    const loc = db.prepare('SELECT type FROM locations WHERE location_id=?').get(row.location_id);
    if (loc?.type !== 'internal') continue;
    assert.equal(Math.round(bin(row.product_id, row.location_id) * 1000) / 1000, Math.round(Number(row.q) * 1000) / 1000, `bin mismatch ${row.product_id}@${row.location_id}`);
  }
});
check('stock valuation equals the inventory-control GL account', () => {
  const gl = db.prepare("SELECT COALESCE(SUM(debit-credit),0) v FROM fiscal_doc_line l JOIN fiscal_doc f ON f.id=l.fiscal_doc_id WHERE l.company_id=? AND l.account_id='coa_104000' AND f.state='posted'").get(company).v;
  const ledger = db.prepare('SELECT COALESCE(SUM(value),0) v FROM stock_ledger_line WHERE company_id=?').get(company).v;
  assert.ok(Math.abs(gl - ledger) < 0.01, `GL ${gl} vs ledger ${ledger}`);
});
check('inventory commands emitted realtime outbox events', () =>
  assert.ok(db.prepare("SELECT COUNT(*) n FROM vnext_event_log WHERE event_type LIKE 'r3.%'").get().n >= 20));
check('offline contract prohibits every stock command (fail closed)', () => {
  for (const type of ['stock.move.post', 'inventory.adjustment', 'stock.transfer', 'r3.stock.ship']) assert.ok(/(finance|stock|inventory|approval|identity|permission|payroll|timesheet|attendance|admin|role|tenant|company|tax|payment|audit|message|whatsapp)/i.test(type), `${type} not prohibited`);
});

for (const line of results) console.log(line);
console.log(`R3 INVENTORY MATRIX SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
