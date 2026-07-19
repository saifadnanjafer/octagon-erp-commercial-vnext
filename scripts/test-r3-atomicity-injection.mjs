// A3 remediation suite: command-by-command atomicity + audit/worklist/outbox
// failure injection on a disposable database. Every injected failure must leave
// ZERO partial residue across stock, GL, AR/AP, business state, audit, worklist,
// and the event outbox — and the same command must then succeed for real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import stock from '../vnext/server/stock/stock-engine.js';
import core from '../vnext/server/modules/r3-core.js';
import approvals from '../vnext/server/approvals/approvals.js';
import events from '../vnext/server/events/events.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r3-inject-'));
const dbPath = path.join(temp, 'r3-inject.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const user = 'inject-test';
const runtime = { events: events.createEventService({ db }) };
const results = [];
let failures = 0;
function check(name, fn) {
  try { fn(); results.push(`PASS ${name}`); }
  catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); }
}

// Residue snapshot across every mandatory-effect surface.
const RESIDUE_TABLES = [
  'stock_move', 'stock_ledger_line', 'fiscal_doc', 'fiscal_doc_line', 'gl_line',
  'arap_document', 'payment', 'x_audit', 'r3_worklist_item', 'vnext_event_log',
  'sales_order', 'sales_delivery', 'sales_delivery_line', 'sales_backorder', 'sales_return', 'sales_credit_note',
  'purchase_receipt', 'purchase_receipt_line', 'purchase_bill_link', 'purchase_match', 'purchase_return',
  'stock_reorder_request', 'stock_pick', 'sales_quote', 'sales_quote_line',
  'mrp_production_order', 'mrp_production_component', 'mrp_production_reversal', 'landed_cost_allocation',
  'subcontract_issue', 'subcontract_receipt', 'project_billing_line',
];
function snapshot() {
  const out = { bins: db.prepare('SELECT COALESCE(SUM(qty),0) q FROM bin').get().q, ledgerValue: db.prepare('SELECT COALESCE(SUM(value),0) v FROM stock_ledger_line').get().v };
  for (const table of RESIDUE_TABLES) out[table] = db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
  return out;
}
function assertNoResidue(before, label) {
  const after = snapshot();
  for (const key of Object.keys(before)) assert.equal(after[key], before[key], `${label}: residue in ${key} (${before[key]} -> ${after[key]})`);
}
// Inject a hard failure by renaming a mandatory-effect table, run the command
// (must throw), verify zero residue, restore, run for real (must succeed).
function injectTableFailure(label, table, command) {
  const before = snapshot();
  db.exec(`ALTER TABLE ${table} RENAME TO ${table}__injected`);
  let threw = false;
  try { command(); } catch (_) { threw = true; }
  db.exec(`ALTER TABLE ${table}__injected RENAME TO ${table}`);
  check(`${label}: injected ${table} failure aborts the command`, () => assert.ok(threw, 'command did not fail under injection'));
  check(`${label}: zero partial residue after injected ${table} failure`, () => assertNoResidue(before, label));
  const result = command();
  check(`${label}: command succeeds for real after injection removed`, () => assert.ok(result !== undefined));
  return result;
}

// ---------- fixture ----------
db.prepare('INSERT OR IGNORE INTO warehouses(warehouse_id,company_id,name) VALUES(?,?,?)').run('inj-wh', company, 'Injection WH');
for (const [locId, name, type] of [
  ['inj-internal', 'Internal', 'internal'], ['inj-internal-2', 'Bin 2', 'internal'],
  ['inj-production', 'WIP', 'production'], ['inj-supplier', 'Supplier', 'supplier'], ['inj-customer', 'Customer', 'customer'],
]) db.prepare('INSERT INTO locations(location_id,warehouse_id,company_id,name,type) VALUES(?,?,?,?,?)').run(locId, 'inj-wh', company, name, type);
const customer = arap.createPartner(db, company, { id: 'inj-customer-p', name: 'Injection Customer', partner_type: 'customer' }, user);
const supplier = arap.createPartner(db, company, { id: 'inj-supplier-p', name: 'Injection Supplier', partner_type: 'supplier' }, user);
const product = core.createProduct(db, company, { id: 'inj-product', code: 'INJ-P', name: 'Injection Product', product_type: 'goods', standard_cost: 10 }, user);
const component = core.createProduct(db, company, { id: 'inj-comp', code: 'INJ-C', name: 'Injection Component', product_type: 'goods', standard_cost: 4 }, user);
const finished = core.createProduct(db, company, { id: 'inj-fin', code: 'INJ-F', name: 'Injection Finished', product_type: 'goods' }, user);
function seed(productId, qty, rate) { const move = stock.createStockMove(db, company, { product_id: productId, qty, from_location_id: 'inj-supplier', to_location_id: 'inj-internal', warehouse_id: 'inj-wh', currency: 'IQD', voucher_ref: `SEED-${productId}-${qty}`, cost_price: rate }); stock.postStockMove(db, company, move.id, user, { rate }); }
seed(product.id, 200, 10);
seed(component.id, 100, 4);

// ---------- 1. golden quote (numbering injection happens on createProduction below,
// which is the command that consumes x_sequences) ----------
const quote = core.createQuote(db, company, { id: 'inj-quote-1', partner_id: customer.id, lines: [{ product_id: product.id, qty: 5, unit_price: 20 }] }, user, runtime);

// ---------- 2. audit failure on order confirmation ----------
let orderCounter = 0;
const order = injectTableFailure('audit/confirmOrder', 'x_audit', () =>
  core.confirmOrder(db, company, { id: `inj-order-${orderCounter++}`, quote_id: quote.id }, user, runtime));

// ---------- 3. outbox failure on reservation ----------
injectTableFailure('outbox/reserveSalesOrder', 'vnext_event_log', () =>
  core.reserveSalesOrder(db, company, order.id, { location_id: 'inj-internal' }, user, runtime));

// ---------- 4. worklist failure on delivery ----------
const orderLine = db.prepare('SELECT id FROM sales_order_line WHERE order_id=?').get(order.id);
injectTableFailure('worklist/deliverSalesOrder', 'r3_worklist_item', () =>
  core.deliverSalesOrder(db, company, order.id, { location_id: 'inj-internal', customer_location_id: 'inj-customer', lines: [{ order_line_id: orderLine.id, qty: 2 }] }, user, runtime));

// ---------- 5. second-line failure: two-line delivery where line 2 exceeds stock ----------
{
  const quote2 = core.createQuote(db, company, { id: 'inj-quote-2l', partner_id: customer.id, lines: [{ product_id: product.id, qty: 1, unit_price: 20 }, { product_id: component.id, qty: 100000, unit_price: 5 }] }, user, runtime);
  const order2 = core.confirmOrder(db, company, { id: 'inj-order-2l', quote_id: quote2.id }, user, runtime);
  const lines = db.prepare('SELECT id FROM sales_order_line WHERE order_id=? ORDER BY rowid').all(order2.id);
  const before = snapshot();
  check('second-line: delivery with failing second line throws', () =>
    assert.throws(() => core.deliverSalesOrder(db, company, order2.id, { location_id: 'inj-internal', customer_location_id: 'inj-customer', lines: [{ order_line_id: lines[0].id, qty: 1 }, { order_line_id: lines[1].id, qty: 100000 }] }, user, runtime)));
  check('second-line: first line left zero residue', () => assertNoResidue(before, 'second-line'));
}

// ---------- 6. GL-before-business-state: invoice under a broken GL hash chain table ----------
{
  const before = snapshot();
  db.exec('ALTER TABLE gl_line RENAME TO gl_line__injected');
  let threw = false;
  try { core.invoiceOrder(db, company, order.id, { delivered_only: true }, user, runtime); } catch (_) { threw = true; }
  db.exec('ALTER TABLE gl_line__injected RENAME TO gl_line');
  check('GL/invoiceOrder: GL failure aborts invoicing', () => assert.ok(threw));
  check('GL/invoiceOrder: no arap/fiscal/business-state residue', () => assertNoResidue(before, 'GL/invoiceOrder'));
  check('GL/invoiceOrder: invoiced_qty untouched after GL failure', () => assert.equal(db.prepare('SELECT COALESCE(SUM(invoiced_qty),0) q FROM sales_order_line WHERE order_id=?').get(order.id).q, 0));
  const invoice = core.invoiceOrder(db, company, order.id, { delivered_only: true }, user, runtime);
  check('GL/invoiceOrder: real invoice posts after injection removed', () => assert.equal(invoice.state, 'posted'));
}

// ---------- 7. audit failure on sales return ----------
injectTableFailure('audit/returnSales', 'x_audit', () =>
  core.returnSales(db, company, order.id, { from_location_id: 'inj-customer', to_location_id: 'inj-internal', lines: [{ order_line_id: orderLine.id, qty: 1, reason: 'defect' }] }, user, runtime));

// ---------- 8. procurement: receipt, bill, match, return ----------
const po = core.insertResource(db, company, 'purchase-orders', { id: 'inj-po', supplier_id: supplier.id, order_number: 'PO-INJ', currency: 'IQD' }, user);
const poLine = core.insertResource(db, company, 'purchase-order-lines', { id: 'inj-po-line', order_id: po.id, product_id: product.id, qty: 2, unit_price: 25 }, user);
let receiptCounter = 0;
injectTableFailure('audit/receivePurchase', 'x_audit', () =>
  core.receivePurchase(db, company, po.id, { from_location_id: 'inj-supplier', to_location_id: 'inj-internal', supplier_doc_ref: `SUP-INJ-${receiptCounter++}`, lines: [{ order_line_id: poLine.id, qty: 1 }] }, user, runtime));
{
  // stock-before-GL on the second receipt: outbox rename lands AFTER stock posting inside the command
  const before = snapshot();
  db.exec('ALTER TABLE vnext_event_log RENAME TO vnext_event_log__injected');
  let threw = false;
  try { core.receivePurchase(db, company, po.id, { from_location_id: 'inj-supplier', to_location_id: 'inj-internal', supplier_doc_ref: 'SUP-INJ-STOCKGL', lines: [{ order_line_id: poLine.id, qty: 1 }] }, user, runtime); } catch (_) { threw = true; }
  db.exec('ALTER TABLE vnext_event_log__injected RENAME TO vnext_event_log');
  check('stock-before-outbox/receivePurchase: failure after stock posting aborts', () => assert.ok(threw));
  check('stock-before-outbox/receivePurchase: posted stock rolled back with the command', () => assertNoResidue(before, 'stock-before-outbox'));
  core.receivePurchase(db, company, po.id, { from_location_id: 'inj-supplier', to_location_id: 'inj-internal', supplier_doc_ref: 'SUP-INJ-REAL2', lines: [{ order_line_id: poLine.id, qty: 1 }] }, user, runtime);
}
injectTableFailure('audit/createVendorBill', 'x_audit', () =>
  core.createVendorBill(db, company, po.id, { received_only: true }, user, runtime));
injectTableFailure('audit/matchPurchase', 'x_audit', () =>
  core.matchPurchase(db, company, po.id, {}, user, runtime));
injectTableFailure('audit/purchaseReturn', 'x_audit', () =>
  core.purchaseReturn(db, company, po.id, { from_location_id: 'inj-internal', to_location_id: 'inj-supplier', lines: [{ order_line_id: poLine.id, qty: 1 }] }, user, runtime));

// ---------- 9. replenishment + pick/pack/ship + cycle count ----------
const reorderRule = core.insertResource(db, company, 'reorder-rules', { id: 'inj-reorder', product_id: product.id, location_id: 'inj-internal', min_qty: 100000, max_qty: 100100, multiple_qty: 10 }, user);
injectTableFailure('audit/createReorderRequest', 'x_audit', () =>
  core.createReorderRequest(db, company, { reorder_rule_id: reorderRule.id }, user, runtime));
{
  const pick = core.insertResource(db, company, 'picks', { id: 'inj-pick', source_ref: order.id }, user);
  core.insertResource(db, company, 'pick-lines', { id: 'inj-pick-line', pick_id: pick.id, product_id: product.id, qty: 1, picked_qty: 1 }, user);
  const before = snapshot();
  db.exec('ALTER TABLE x_audit RENAME TO x_audit__injected');
  let threw = false;
  try { core.pickPackShip(db, company, { pick_id: pick.id, destination_location_id: 'inj-customer' }, user, runtime); } catch (_) { threw = true; }
  db.exec('ALTER TABLE x_audit__injected RENAME TO x_audit');
  check('audit/pickPackShip: injected audit failure aborts shipping', () => assert.ok(threw));
  check('audit/pickPackShip: pick state and stock unchanged', () => { assertNoResidue(before, 'pickPackShip'); assert.notEqual(db.prepare('SELECT state FROM stock_pick WHERE id=?').get(pick.id).state, 'shipped'); });
  check('audit/pickPackShip: real ship succeeds after injection removed', () => assert.equal(core.pickPackShip(db, company, { pick_id: pick.id, destination_location_id: 'inj-customer' }, user, runtime).state, 'shipped'));
}
{
  const count = core.insertResource(db, company, 'cycle-counts', { id: 'inj-count', location_id: 'inj-internal', count_date: '2026-07-19' }, user);
  core.insertResource(db, company, 'cycle-count-lines', { id: 'inj-count-line', count_id: count.id, product_id: product.id, expected_qty: 1, counted_qty: 2 }, user);
  const approval = approvals._internal.createApproval(db, { entity: 'stock_cycle_count', record_id: count.id, action: 'cycle_count_approve', approver_role: 'manager', company_id: company, tenant_id: company, payload: { count_id: count.id } }, user);
  const approvalId = approval.json.data.id;
  approvals._internal.decideApproval(db, approvalId, 'approve', { user: 'cycle-approver', roles: ['manager'] });
  injectTableFailure('audit/cycleCountApprove', 'x_audit', () =>
    core.cycleCountApprove(db, company, { count_id: count.id, approval_ref: approvalId, posting_date: '2026-07-19' }, 'cycle-approver', runtime));
}

// ---------- 10. manufacturing issue/complete/reverse ----------
const bom = core.insertResource(db, company, 'boms', { id: 'inj-bom', product_id: finished.id, code: 'BOM-INJ', output_qty: 1 }, user);
core.insertResource(db, company, 'bom-lines', { id: 'inj-bom-line', bom_id: bom.id, component_product_id: component.id, qty: 2 }, user);
let productionCounter = 0;
const production = injectTableFailure('numbering/createProduction', 'x_sequences', () =>
  core.createProduction(db, company, { id: `inj-production-${productionCounter++}`, bom_id: bom.id, qty: 2 }, user, runtime));
injectTableFailure('audit/issueProduction', 'x_audit', () =>
  core.issueProduction(db, company, production.id, { source_location_id: 'inj-internal', wip_location_id: 'inj-production' }, user, runtime));
injectTableFailure('audit/completeProduction', 'x_audit', () =>
  core.completeProduction(db, company, production.id, { wip_location_id: 'inj-production', destination_location_id: 'inj-internal', qty: 2, labor_cost: 3, overhead_cost: 2 }, user, runtime));
{
  const finishedBinBefore = Number(db.prepare("SELECT COALESCE(qty,0) qty FROM bin WHERE product_id=? AND location_id='inj-internal'").get(finished.id)?.qty || 0);
  const reversal = injectTableFailure('audit/reverseProduction', 'x_audit', () =>
    core.reverseProduction(db, company, production.id, { reason: 'quality hold', destination_location_id: 'inj-internal', wip_location_id: 'inj-production' }, user, runtime));
  check('reverseProduction genuinely removes finished goods from stock', () => {
    const after = Number(db.prepare("SELECT COALESCE(qty,0) qty FROM bin WHERE product_id=? AND location_id='inj-internal'").get(finished.id)?.qty || 0);
    assert.equal(after, finishedBinBefore - 2);
    assert.ok(reversal.finished_move_id);
    assert.equal(reversal.component_move_ids.length, 1);
  });
  check('reverseProduction returns consumed components to stock', () =>
    assert.ok(db.prepare("SELECT 1 FROM stock_move WHERE id=? AND state='done'").get(reversal.component_move_ids[0])));
}

// ---------- 11. landed cost + subcontract + project billing + field service ----------
const landedMoveSeed = db.prepare("SELECT id FROM stock_move WHERE voucher_ref='SEED-inj-product-200'").get();
db.prepare('INSERT OR REPLACE INTO stock_valuation_category_policy(company_id,category,valuation_account_id,cogs_account_id,adjustment_account_id,accrual_account_id) VALUES(?,?,?,?,?,?)').run(company, 'Staged', 'coa_104000', 'coa_501000', 'coa_501000', 'coa_201000');
{
  let landedCounter = 0;
  const makeLanded = () => core.insertResource(db, company, 'landed-costs', { id: `inj-landed-${landedCounter++}`, name: 'Injection Freight', total_amount: 10, allocation_basis: 'value' }, user);
  const landed = makeLanded();
  injectTableFailure('audit/allocateLandedCost', 'x_audit', () =>
    core.allocateLandedCost(db, company, landed.id, { allocations: [{ stock_move_id: landedMoveSeed.id, value: 1 }] }, user, runtime));
  injectTableFailure('audit/reverseLandedCost', 'x_audit', () =>
    core.reverseLandedCost(db, company, landed.id, {}, user, runtime));
}
{
  const sub = core.insertResource(db, company, 'subcontract-orders', { id: 'inj-sub', supplier_id: supplier.id, order_number: 'SUB-INJ', qty: 1, service_cost: 5 }, user);
  injectTableFailure('audit/issueSubcontract', 'x_audit', () =>
    core.issueSubcontract(db, company, sub.id, { from_location_id: 'inj-internal', to_location_id: 'inj-supplier', lines: [{ product_id: component.id, qty: 1 }] }, user, runtime));
  injectTableFailure('audit/receiveSubcontract', 'x_audit', () =>
    core.receiveSubcontract(db, company, sub.id, { from_location_id: 'inj-supplier', to_location_id: 'inj-internal', product_id: finished.id, qty: 1, service_cost: 5 }, user, runtime));
  const receipt = db.prepare('SELECT id FROM subcontract_receipt WHERE order_id=?').get(sub.id);
  injectTableFailure('audit/reverseSubcontractReceipt', 'x_audit', () =>
    core.reverseSubcontractReceipt(db, company, receipt.id, {}, user, runtime));
}
{
  const project = core.insertResource(db, company, 'projects', { id: 'inj-project', partner_id: customer.id, name: 'Injection Project' }, user);
  core.insertResource(db, company, 'project-timesheets', { id: 'inj-ts', project_id: project.id, user_id: user, work_date: '2026-07-19', hours: 2, rate: 15, billable: 1 }, user);
  injectTableFailure('audit/billProject', 'x_audit', () =>
    core.billProject(db, company, project.id, { timesheet_ids: ['inj-ts'] }, user, runtime));
}
{
  const fso = core.insertResource(db, company, 'field-service-orders', { id: 'inj-fso', partner_id: customer.id }, user);
  injectTableFailure('audit/consumeFieldPart', 'x_audit', () =>
    core.consumeFieldPart(db, company, fso.id, { product_id: product.id, qty: 1, from_location_id: 'inj-internal', to_location_id: 'inj-customer' }, user, runtime));
}

// ---------- 12. outbox rows are written durably for successful commands ----------
check('successful commands write durable outbox events', () =>
  assert.ok(db.prepare("SELECT COUNT(*) n FROM vnext_event_log WHERE event_type LIKE 'r3.%'").get().n >= 15));

for (const line of results) console.log(line);
console.log(`R3 ATOMICITY INJECTION SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
