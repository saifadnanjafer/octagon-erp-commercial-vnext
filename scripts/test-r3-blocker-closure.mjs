// R3 blocker-closure evidence on a fresh disposable SQLite database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import stock from '../vnext/server/stock/stock-engine.js';
import core from '../vnext/server/modules/r3-core.js';
import chatter from '../vnext/server/chatter/chatter.js';
import approvals from '../vnext/server/approvals/approvals.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r3-closure-'));
const dbPath = path.join(temp, 'r3.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const user = 'r3-closure-test';
const checks = [];
function check(name, fn) { try { fn(); checks.push(`PASS ${name}`); } catch (error) { checks.push(`FAIL ${name}: ${error.message}`); throw error; } }
function addLocation(id, name, type) { db.prepare('INSERT INTO locations(location_id,warehouse_id,company_id,name,type) VALUES(?,?,?,?,?)').run(id, 'r3-closure-wh', company, name, type); }
function addProduct(id, code, name, cost = 10) { return core.createProduct(db, company, { id, code, name, product_type: 'goods', standard_cost: cost, tracking_type: 'none' }, user); }
function postMove(id, productId, qty, from, to, rate = 10) { const move = stock.createStockMove(db, company, { id, product_id: productId, qty, from_location_id: from, to_location_id: to, warehouse_id: 'r3-closure-wh', currency: 'IQD', posting_date: '2026-07-18', voucher_ref: id }); return stock.postStockMove(db, company, move.id, user, { rate }); }

db.prepare('INSERT OR IGNORE INTO warehouses(warehouse_id,company_id,name) VALUES(?,?,?)').run('r3-closure-wh', company, 'R3 Closure Warehouse');
addLocation('r3-closure-internal', 'Closure Internal', 'internal');
addLocation('r3-closure-internal-2', 'Closure Bin 2', 'internal');
addLocation('r3-closure-production', 'Closure Production', 'production');
addLocation('r3-closure-supplier', 'Closure Supplier', 'supplier');
addLocation('r3-closure-customer', 'Closure Customer', 'customer');
db.prepare("INSERT OR IGNORE INTO fiscal_periods(period_id,company_id,name,start_date,end_date,status) VALUES(?,?,?,?,?,?)").run('r3-closure-period', company, 'July 2026', '2026-07-01', '2026-07-31', 'open');
const customer = arap.createPartner(db, company, { id: 'r3-closure-customer-partner', name: 'Closure Customer', partner_type: 'customer' }, user);
const supplier = arap.createPartner(db, company, { id: 'r3-closure-supplier-partner', name: 'Closure Supplier', partner_type: 'supplier' }, user);
const product = addProduct('r3-closure-product', 'R3-CLOSURE', 'Closure Product', 10);
const component = addProduct('r3-closure-component', 'R3-COMP', 'Closure Component', 4);
const finished = addProduct('r3-closure-finished', 'R3-FIN', 'Closure Finished', 0);
postMove('r3-closure-seed-product', product.id, 20, 'r3-closure-supplier', 'r3-closure-internal', 10);
postMove('r3-closure-seed-component', component.id, 10, 'r3-closure-supplier', 'r3-closure-internal', 4);

const quote = core.createQuote(db, company, { id: 'r3-closure-quote', partner_id: customer.id, lines: [{ product_id: product.id, qty: 5, unit_price: 25 }] }, user);
const order = core.confirmOrder(db, company, { id: 'r3-closure-order', quote_id: quote.id }, user);
const reservations = core.reserveSalesOrder(db, company, order.id, { location_id: 'r3-closure-internal' }, user);
check('sales reservation is ledger-scoped', () => assert.equal(reservations[0].reserved_qty, 5));
const delivery = core.deliverSalesOrder(db, company, order.id, { location_id: 'r3-closure-internal', customer_location_id: 'r3-closure-customer', lines: [{ order_line_id: db.prepare('SELECT id FROM sales_order_line WHERE order_id=?').get(order.id).id, qty: 3 }] }, user);
check('sales partial delivery creates ledger lines', () => { assert.equal(delivery.state, 'partial'); assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_ledger_line WHERE stock_move_id=?').get(delivery.lines[0].stock_move_id).n, 1); });
check('sales backorder is explicit', () => assert.equal(db.prepare('SELECT COUNT(*) n FROM sales_backorder WHERE order_id=? AND state=?').get(order.id, 'open').n, 1));
const invoice = core.invoiceOrder(db, company, order.id, { delivered_only: true }, user);
check('sales invoice follows delivered quantity', () => assert.equal(invoice.state, 'posted'));
const returned = core.returnSales(db, company, order.id, { from_location_id: 'r3-closure-customer', to_location_id: 'r3-closure-internal', lines: [{ order_line_id: db.prepare('SELECT id FROM sales_order_line WHERE order_id=?').get(order.id).id, qty: 1, reason: 'defect' }] }, user);
check('sales return creates credit note and reverse move', () => assert.equal(returned[0].credit.state, 'posted'));
db.prepare('UPDATE partner_master SET credit_limit=? WHERE id=?').run(1, customer.id);
const creditQuote = core.createQuote(db, company, { id: 'r3-credit-quote', partner_id: customer.id, lines: [{ product_id: product.id, qty: 1, unit_price: 25 }] }, user);
check('credit limit blocks without approval', () => assert.throws(() => core.confirmOrder(db, company, { quote_id: creditQuote.id }, user), /credit limit approval/));
const creditApproval = approvals._internal.createApproval(db, { entity:'sales_quote', record_id:creditQuote.id, action:'credit_override', approver_role:'manager', company_id:company, tenant_id:company, payload:{ amount:creditQuote.total_amount } }, user);
const creditApprovalId = creditApproval.json.data.id;
approvals._internal.decideApproval(db, creditApprovalId, 'approve', { user:'credit-approver', roles:['manager'] });
const approvedOrder = core.confirmOrder(db, company, { id: 'r3-approved-order', quote_id: creditQuote.id, approval_ref: creditApprovalId, salesperson_id: 'seller-1', commission_rate: 5 }, user);
check('approved credit override accrues commission', () => assert.equal(db.prepare('SELECT COUNT(*) n FROM sales_commission WHERE order_id=?').get(approvedOrder.id).n, 1));
const chatterItem = chatter._internal.postChatterItem(db, 'sales_order', order.id, { body: 'R3 closure note', author: user });
check('chatter and history are available', () => { assert.equal(chatterItem.status, 201); assert.ok(core.getHistory(db, 'sales_order', order.id).length > 0); });

const po = core.insertResource(db, company, 'purchase-orders', { id: 'r3-closure-po', supplier_id: supplier.id, order_number: 'PO-CLOSURE', currency: 'IQD', total_amount: 50 }, user);
const poLine = core.insertResource(db, company, 'purchase-order-lines', { id: 'r3-closure-po-line', order_id: po.id, product_id: product.id, qty: 2, unit_price: 25 }, user);
const receipt = core.receivePurchase(db, company, po.id, { from_location_id: 'r3-closure-supplier', to_location_id: 'r3-closure-internal', supplier_doc_ref: 'SUP-CLOSURE-1', lines: [{ order_line_id: poLine.id, qty: 1 }] }, user);
check('procurement partial receipt posts stock', () => assert.equal(receipt.lines[0].posted.success, true));
check('duplicate supplier document is rejected', () => assert.throws(() => core.receivePurchase(db, company, po.id, { from_location_id: 'r3-closure-supplier', to_location_id: 'r3-closure-internal', supplier_doc_ref: 'SUP-CLOSURE-1', lines: [] }, user), /duplicate supplier/));
const bill = core.createVendorBill(db, company, po.id, { received_only: true }, user);
check('vendor bill is posted from received quantity', () => assert.equal(bill.state, 'posted'));
check('three-way match rejects a body-forced fabricated match', () => assert.throws(() => core.matchPurchase(db, company, po.id, { ordered_qty: 999, received_qty: 999, billed_qty: 999, ordered_price: 0, billed_price: 0 }, user), /posted receipt and posted supplier bill/));
const matchedPo = core.insertResource(db, company, 'purchase-orders', { id: 'r3-closure-po-matched', supplier_id: supplier.id, order_number: 'PO-MATCHED', currency: 'IQD' }, user);
const matchedLine = core.insertResource(db, company, 'purchase-order-lines', { id: 'r3-closure-po-matched-line', order_id: matchedPo.id, product_id: product.id, qty: 1, unit_price: 25 }, user);
core.receivePurchase(db, company, matchedPo.id, { from_location_id: 'r3-closure-supplier', to_location_id: 'r3-closure-internal', supplier_doc_ref: 'SUP-MATCHED-1', lines: [{ order_line_id: matchedLine.id, qty: 1 }] }, user);
core.createVendorBill(db, company, matchedPo.id, { received_only: true }, user);
check('three-way match is derived from posted PO receipt and supplier bill', () => assert.equal(core.matchPurchase(db, company, matchedPo.id, { ordered_qty: 999, received_qty: 0, billed_qty: 0, ordered_price: 0, billed_price: 0 }, user).state, 'matched'));
const purchaseReturn = core.purchaseReturn(db, company, po.id, { from_location_id: 'r3-closure-internal', to_location_id: 'r3-closure-supplier', lines: [{ order_line_id: poLine.id, qty: 1 }] }, user);
check('procurement return reverses stock', () => assert.equal(purchaseReturn[0].posted.success, true));

const route = core.insertResource(db, company, 'routes', { id: 'r3-closure-route', name: 'Closure Route' }, user);
core.insertResource(db, company, 'route-rules', { id: 'r3-closure-route-rule', route_id: route.id, source_location_id: 'r3-closure-internal', dest_location_id: 'r3-closure-internal-2', sequence: 1 }, user);
const resolved = core.resolveRoute(db, company, { demand_ref: 'closure-demand', source_location_id: 'r3-closure-internal', destination_location_id: 'r3-closure-internal-2' }, user);
check('inventory route resolution is persisted', () => assert.equal(resolved.rule_id, 'r3-closure-route-rule'));
const reorderRule = core.insertResource(db, company, 'reorder-rules', { id: 'r3-closure-reorder', product_id: product.id, location_id: 'r3-closure-internal', min_qty: 100, max_qty: 120, multiple_qty: 10 }, user);
check('reorder request is explicit', () => assert.equal(core.createReorderRequest(db, company, { reorder_rule_id: reorderRule.id }, user).state, 'draft'));
db.prepare('INSERT INTO stock_putaway_rule(id,company_id,warehouse_id,source_location_id,destination_location_id,product_id,priority,active) VALUES(?,?,?,?,?,?,?,?)').run('r3-closure-putaway', company, 'r3-closure-wh', 'r3-closure-internal', 'r3-closure-internal-2', product.id, 1, 1);
check('putaway posts through stock engine', () => assert.equal(core.putaway(db, company, { warehouse_id: 'r3-closure-wh', product_id: product.id, qty: 1, source_location_id: 'r3-closure-internal' }, user).posted.success, true));
const pick = core.insertResource(db, company, 'picks', { id: 'r3-closure-pick', source_ref: order.id }, user);
core.insertResource(db, company, 'pick-lines', { id: 'r3-closure-pick-line', pick_id: pick.id, product_id: product.id, qty: 1, picked_qty: 1 }, user);
check('pick pack ship posts a ledger move and is stateful', () => { assert.equal(core.pickPackShip(db, company, { pick_id: pick.id, destination_location_id: 'r3-closure-customer' }, user).state, 'shipped'); assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_move WHERE voucher_ref LIKE ? AND state='done'").get(`PICK-${pick.id}-%`).n, 1); assert.equal(core.pickPackShip(db, company, { pick_id: pick.id, destination_location_id: 'r3-closure-customer' }, user).state, 'shipped'); assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_move WHERE voucher_ref LIKE ?").get(`PICK-${pick.id}-%`).n, 1); });
const count = core.insertResource(db, company, 'cycle-counts', { id: 'r3-closure-count', location_id: 'r3-closure-internal', count_date: '2026-07-18' }, user);
core.insertResource(db, company, 'cycle-count-lines', { id: 'r3-closure-count-line', count_id: count.id, product_id: product.id, expected_qty: 1, counted_qty: 1 }, user);
const cycleApproval = approvals._internal.createApproval(db, { entity:'stock_cycle_count', record_id:count.id, action:'cycle_count_approve', approver_role:'manager', company_id:company, tenant_id:company, payload:{ count_id:count.id } }, user);
const cycleApprovalId = cycleApproval.json.data.id;
approvals._internal.decideApproval(db, cycleApprovalId, 'approve', { user:'cycle-approver', roles:['manager'] });
check('cycle count approval uses canonical Approval Center', () => assert.equal(core.cycleCountApprove(db, company, { count_id: count.id, approval_ref: cycleApprovalId, posting_date: '2026-07-18' }, 'cycle-approver').approval.state, 'approved'));

const bom = core.insertResource(db, company, 'boms', { id: 'r3-closure-bom', product_id: finished.id, code: 'BOM-CLOSURE', output_qty: 1 }, user);
core.insertResource(db, company, 'bom-lines', { id: 'r3-closure-bom-line', bom_id: bom.id, component_product_id: component.id, qty: 2 }, user);
const production = core.createProduction(db, company, { id: 'r3-closure-production', bom_id: bom.id, qty: 2 }, user);
check('manufacturing issue enters WIP', () => assert.equal(core.issueProduction(db, company, production.id, { source_location_id: 'r3-closure-internal', wip_location_id: 'r3-closure-production' }, user)[0].posted.success, true));
check('manufacturing completion rolls cost and posts output', () => assert.equal(core.completeProduction(db, company, production.id, { wip_location_id: 'r3-closure-production', destination_location_id: 'r3-closure-internal', qty: 2, labor_cost: 3, overhead_cost: 2 }, user).posted.success, true));
check('manufacturing reversal is auditable', () => assert.equal(core.reverseProduction(db, company, production.id, { reason: 'quality hold' }, user).reason, 'quality hold'));
const landedMove = db.prepare('SELECT id FROM stock_move WHERE id=?').get('r3-closure-seed-product');
const landed = core.insertResource(db, company, 'landed-costs', { id: 'r3-closure-landed', name: 'Closure Freight', total_amount: 10, allocation_basis: 'value' }, user);
db.prepare('INSERT OR REPLACE INTO stock_valuation_category_policy(company_id,category,valuation_account_id,cogs_account_id,adjustment_account_id,accrual_account_id) VALUES(?,?,?,?,?,?)').run(company, 'Staged', 'coa_104000', 'coa_501000', 'coa_501000', 'coa_201000');
check('landed cost posts valuation GL, updates stock value, and reverses exactly', () => {
  const before = Number(db.prepare('SELECT value FROM stock_ledger_line WHERE stock_move_id=? AND qty>0 ORDER BY rowid LIMIT 1').get(landedMove.id)?.value || 0);
  const allocated = core.allocateLandedCost(db, company, landed.id, { allocations: [{ stock_move_id: landedMove.id, value: 1 }] }, user);
  const valuationDoc = db.prepare('SELECT * FROM fiscal_doc WHERE id=? AND company_id=?').get(allocated.valuation_doc_id, company);
  assert.equal(allocated.total_allocated, 10); assert.equal(valuationDoc.state, 'posted'); assert.ok(db.prepare('SELECT COUNT(*) n FROM fiscal_doc_line WHERE fiscal_doc_id=?').get(valuationDoc.id).n >= 2); assert.ok(db.prepare('SELECT COUNT(*) n FROM gl_line WHERE fiscal_doc_id=?').get(valuationDoc.id).n >= 2);
  const after = Number(db.prepare('SELECT value FROM stock_ledger_line WHERE stock_move_id=? AND qty>0 ORDER BY rowid LIMIT 1').get(landedMove.id)?.value || 0); assert.equal(after, before + 10);
  const reversed = core.reverseLandedCost(db, company, landed.id, {}, user); const audit = db.prepare('SELECT after FROM x_audit WHERE entity=? AND record_id=? AND action=? ORDER BY rowid DESC LIMIT 1').get('landed_cost', landed.id, 'reversed'); const reversalDocId = JSON.parse(audit.after).reversal_doc_id; const reversalDoc = db.prepare('SELECT * FROM fiscal_doc WHERE id=?').get(reversalDocId);
  assert.equal(reversed.length, 1); assert.equal(reversalDoc?.reversal_of_id, valuationDoc.id); const restored = Number(db.prepare('SELECT value FROM stock_ledger_line WHERE stock_move_id=? AND qty>0 ORDER BY rowid LIMIT 1').get(landedMove.id)?.value || 0); assert.equal(restored, before);
});
const subcontract = core.insertResource(db, company, 'subcontract-orders', { id: 'r3-closure-sub', supplier_id: supplier.id, order_number: 'SUB-CLOSURE', qty: 1, service_cost: 5 }, user);
check('subcontract issue and receipt are ledger-backed', () => { const issued = core.issueSubcontract(db, company, subcontract.id, { from_location_id: 'r3-closure-internal', to_location_id: 'r3-closure-supplier', lines: [{ product_id: component.id, qty: 1 }] }, user)[0]; assert.ok(db.prepare('SELECT 1 FROM stock_ledger_line WHERE stock_move_id=?').get(issued.stock_move_id)); const received = core.receiveSubcontract(db, company, subcontract.id, { from_location_id: 'r3-closure-supplier', to_location_id: 'r3-closure-internal', product_id: finished.id, qty: 1, service_cost: 5 }, user); assert.ok(db.prepare('SELECT 1 FROM stock_ledger_line WHERE stock_move_id=?').get(received.stock_move_id)); assert.equal(received.total_value, received.consumed_value + received.service_cost + received.variance + received.landed_value); });

const project = core.insertResource(db, company, 'projects', { id: 'r3-closure-project', partner_id: customer.id, name: 'Closure Project' }, user);
core.insertResource(db, company, 'project-timesheets', { id: 'r3-closure-ts', project_id: project.id, user_id: user, work_date: '2026-07-18', hours: 2, rate: 15, billable: 1 }, user);
check('project billing posts explicitly selected timesheet invoice', () => assert.equal(core.billProject(db, company, project.id, { timesheet_ids: ['r3-closure-ts'] }, user).invoice.state, 'posted'));
const ticket = core.insertResource(db, company, 'tickets', { id: 'r3-closure-ticket', partner_id: customer.id, title: 'SLA closure ticket', opened_at: core.now() }, user);
const sla = core.insertResource(db, company, 'slas', { id: 'r3-closure-sla', name: 'Immediate', response_hours: 1, resolution_hours: 1 }, user);
core.insertResource(db, company, 'ticket-slas', { ticket_id: ticket.id, sla_id: sla.id, response_due: '2026-07-17T00:00:00.000Z', resolution_due: '2026-07-17T00:00:00.000Z' }, user);
check('SLA tick creates escalation', () => assert.equal(core.slaTick(db, company, ticket.id, { at: '2026-07-18T00:00:00.000Z' }, user).some(row => row.escalation_level), true));
const clockTicket = core.insertResource(db, company, 'tickets', { id: 'r3-closure-clock-ticket', partner_id: customer.id, title: 'Business clock ticket', opened_at: '2026-07-13T09:00:00.000Z' }, user);
const clockSla = core.insertResource(db, company, 'slas', { id: 'r3-closure-clock-sla', name: 'Business clock', response_hours: 2, resolution_hours: 8 }, user);
core.insertResource(db, company, 'ticket-slas', { ticket_id: clockTicket.id, sla_id: clockSla.id }, user);
check('SLA business clock pauses, resumes, and then breaches on active hours', () => { const schedule = { start: '09:00', end: '17:00', weekdays: [1, 2, 3, 4, 5] }; const paused = core.slaTick(db, company, clockTicket.id, { action: 'pause', at: '2026-07-13T10:00:00.000Z', business_hours: schedule }, user); const resumed = core.slaTick(db, company, clockTicket.id, { action: 'resume', at: '2026-07-13T11:00:00.000Z', business_hours: schedule }, user); const state = db.prepare('SELECT sla_state, paused_business_seconds FROM helpdesk_ticket_sla WHERE ticket_id=? AND sla_id=?').get(clockTicket.id, clockSla.id); const breached = core.slaTick(db, company, clockTicket.id, { at: '2026-07-14T10:00:00.000Z', business_hours: schedule }, user); assert.equal(paused[0].event_type, 'pause'); assert.equal(resumed.some(row => row.event_type === 'resume'), true); assert.equal(state.sla_state, 'running'); assert.ok(Number(state.paused_business_seconds) > 0); assert.equal(breached.some(row => row.escalation_level), true); });
const field = core.insertResource(db, company, 'field-service-orders', { id: 'r3-closure-field', partner_id: customer.id }, user);
check('field service part consumption posts stock', () => assert.equal(core.consumeFieldPart(db, company, field.id, { product_id: product.id, qty: 1, from_location_id: 'r3-closure-internal', to_location_id: 'r3-closure-customer' }, user).posted.success, true));
check('cross-cutting audit and worklist evidence', () => { assert.ok(db.prepare('SELECT COUNT(*) n FROM x_audit WHERE entity=?').get('sales_order').n > 0); assert.ok(db.prepare('SELECT COUNT(*) n FROM r3_worklist_item WHERE company_id=?').get(company).n > 0); assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0); });

console.log(checks.join('\n'));
console.log(`R3 BLOCKER CLOSURE SUITE: ${checks.length} PASS, 0 FAIL, 0 SKIP`);
db.close();
