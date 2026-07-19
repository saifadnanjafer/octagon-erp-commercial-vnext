// A5 remediation suite: subcontract supplied-component valuation on a disposable database.
// Finished Value = Consumed Supplied Components + Service Cost + Authorized Variance + Applicable Landed Cost.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import core from '../vnext/server/modules/r3-core.js';
import subcontract from '../vnext/server/modules/subcontracting/subcontracting-engine.js';
import approvals from '../vnext/server/approvals/approvals.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r3-subcontract-'));
const dbPath = path.join(temp, 'r3-subcontract.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const user = 'sub-test';
const results = [];
let failures = 0;
function check(name, fn) {
  try { fn(); results.push(`PASS ${name}`); }
  catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); }
}

// --- fixture: supplier partner, warehouse/locations, valuation policy, component + finished products, stock on hand
const supplier = arap.createPartner(db, company, { id: 'sub-supplier', name: 'Subcontract Supplier', partner_type: 'supplier' }, user);
db.prepare("INSERT INTO warehouses (warehouse_id, company_id, name) VALUES ('sub-wh', ?, 'Sub WH')").run(company);
for (const [id, name, type] of [
  ['sub-internal', 'Stock', 'internal'],
  ['sub-supplier-loc', 'Supplier', 'supplier'],
  ['sub-loss', 'Loss', 'inventory_loss'],
]) db.prepare('INSERT INTO locations (location_id, warehouse_id, company_id, name, type) VALUES (?, ?, ?, ?, ?)').run(id, 'sub-wh', company, name, type);
db.prepare("INSERT INTO stock_valuation_category_policy (company_id, category, valuation_account_id, cogs_account_id, adjustment_account_id, accrual_account_id) VALUES (?, 'SUB', 'coa_104000', 'coa_501000', 'coa_502000', 'coa_201000')").run(company);

const subCategory = core.createCategory(db, company, { id: 'sub-cat', code: 'SUB', name: 'SUB' }, user);
const component = core.createProduct(db, company, { id: 'sub-comp', code: 'SUB-COMP', name: 'Component', product_type: 'goods', category_id: subCategory.id }, user);
const finished = core.createProduct(db, company, { id: 'sub-fin', code: 'SUB-FIN', name: 'Finished', product_type: 'goods', category_id: subCategory.id }, user);

import stockEngine from '../vnext/server/stock/stock-engine.js';
// Seed 10 components at cost 7 each into internal stock.
const seed = stockEngine.createStockMove(db, company, { product_id: component.id, qty: 10, from_location_id: 'sub-supplier-loc', to_location_id: 'sub-internal', warehouse_id: 'sub-wh', currency: 'IQD', voucher_ref: 'SUB-SEED', cost_price: 7 });
stockEngine.postStockMove(db, company, seed.id, user, { rate: 7 });

const order = core.insertResource(db, company, 'subcontract-orders', { id: 'sub-order', supplier_id: supplier.id, order_number: 'SUB-VAL-1', qty: 2, service_cost: 30 }, user);
db.prepare('INSERT INTO subcontract_component(id,company_id,order_id,product_id,qty,supplied_qty,returned_qty) VALUES(?,?,?,?,?,0,0)').run('sub-comp-line', company, order.id, component.id, 6);

// --- 1. issue captures immutable ledger cost
const issues = subcontract.issueSubcontract(db, company, order.id, { lines: [{ product_id: component.id, qty: 6 }] }, user, null);
check('issue posts stock move and captures immutable ledger unit cost', () => {
  assert.equal(issues.length, 1);
  assert.equal(issues[0].unit_cost, 7);
  assert.equal(issues[0].value, 42);
  assert.equal(db.prepare('SELECT supplied_qty FROM subcontract_component WHERE id=?').get('sub-comp-line').supplied_qty, 6);
});
check('issue reduces internal bin', () => assert.equal(db.prepare("SELECT qty FROM bin WHERE company_id=? AND product_id=? AND location_id='sub-internal'").get(company, component.id).qty, 4));

// --- 2. unused return reduces consumed value; scrap/shortage stay in basis
const ret = subcontract.adjustSubcontract(db, company, order.id, { kind: 'return_unused', product_id: component.id, qty: 1 }, user, null);
check('unused return comes back at original issue cost', () => { assert.equal(ret.unit_cost, 7); assert.equal(ret.value, 7); });
check('unused return restores internal bin and returned_qty', () => {
  assert.equal(db.prepare("SELECT qty FROM bin WHERE company_id=? AND product_id=? AND location_id='sub-internal'").get(company, component.id).qty, 5);
  assert.equal(db.prepare('SELECT returned_qty FROM subcontract_component WHERE id=?').get('sub-comp-line').returned_qty, 1);
});
const scrap = subcontract.adjustSubcontract(db, company, order.id, { kind: 'scrap', product_id: component.id, qty: 1, note: 'damaged at supplier' }, user, null);
check('scrap is recorded and stays in consumed basis', () => { assert.equal(scrap.stock_move_id, null); assert.equal(scrap.value, 7); });
const shortage = subcontract.adjustSubcontract(db, company, order.id, { kind: 'shortage', product_id: component.id, qty: 1 }, user, null);
check('shortage is recorded without a stock move', () => assert.equal(shortage.stock_move_id, null));
check('over-adjustment beyond issued quantity is rejected', () =>
  assert.throws(() => subcontract.adjustSubcontract(db, company, order.id, { kind: 'shortage', product_id: component.id, qty: 10 }, user, null), /exceeds remaining issued/));
check('consumed value = issued - unused returns only', () => assert.equal(subcontract._internal.consumedComponentValue(db, order.id), 35));

// --- 3. variance requires an approved override
check('variance without approval is rejected', () =>
  assert.throws(() => subcontract.receiveSubcontract(db, company, order.id, { product_id: finished.id, qty: 2, variance: 5 }, user, null), /variance requires an approved/));

const approval = approvals._internal.createApproval(db, { entity: 'subcontract_order', record_id: order.id, action: 'subcontract_variance_override', approver_role: 'manager', company_id: company, tenant_id: company, payload: { variance: 5 } }, user);
const approvalId = approval.json.data.id;
approvals._internal.decideApproval(db, approvalId, 'approve', { user: 'variance-approver', roles: ['manager'] });

// --- 4. landed cost applicability + full formula
const landed = core.insertResource(db, company, 'landed-costs', { id: 'sub-landed', name: 'Freight to subcontractor', total_amount: 12, allocation_basis: 'value' }, user);
const glBefore = db.prepare("SELECT COALESCE(SUM(debit-credit),0) v FROM fiscal_doc_line l JOIN fiscal_doc f ON f.id=l.fiscal_doc_id WHERE l.company_id=? AND l.account_id='coa_104000' AND f.state='posted'").get(company).v;
const receipt = subcontract.receiveSubcontract(db, company, order.id, {
  product_id: finished.id, qty: 2, service_cost: 30, variance: 5, approval_ref: approvalId,
  landed_cost_ids: [landed.id], idempotency_key: 'sub-receive-1',
}, user, null);
check('finished value = consumed(35) + service(30) + variance(5) + landed(12)', () => {
  assert.equal(receipt.consumed_value, 35);
  assert.equal(receipt.service_cost, 30);
  assert.equal(receipt.variance, 5);
  assert.equal(receipt.landed_value, 12);
  assert.equal(receipt.total_value, 82);
  assert.equal(receipt.unit_value, 41);
});
check('finished goods enter stock ledger at the canonical unit value', () => {
  const line = db.prepare("SELECT valuation_rate FROM stock_ledger_line WHERE stock_move_id=? AND location_id='sub-internal'").get(receipt.stock_move_id);
  assert.equal(Number(line.valuation_rate), 41);
});
check('service AP bill is posted and linked', () => {
  assert.ok(receipt.service_bill_id);
  const bill = db.prepare('SELECT a.total_amount, f.state FROM arap_document a JOIN fiscal_doc f ON f.id=a.fiscal_doc_id WHERE a.id=?').get(receipt.service_bill_id);
  assert.equal(bill.total_amount, 30);
  assert.equal(bill.state, 'posted');
});
check('variance GL doc is posted and balanced', () => {
  assert.ok(receipt.variance_doc_id);
  const sums = db.prepare('SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM fiscal_doc_line WHERE fiscal_doc_id=?').get(receipt.variance_doc_id);
  assert.equal(sums.d, 5);
  assert.equal(sums.d, sums.c);
});
check('every posted fiscal doc in the flow is balanced', () => {
  const rows = db.prepare("SELECT f.id, COALESCE(SUM(l.debit),0) d, COALESCE(SUM(l.credit),0) c FROM fiscal_doc f JOIN fiscal_doc_line l ON l.fiscal_doc_id=f.id WHERE f.company_id=? AND f.state='posted' GROUP BY f.id").all(company);
  for (const row of rows) assert.ok(Math.abs(row.d - row.c) < 0.005, `unbalanced ${row.id}`);
});

// --- 5. idempotency
check('receive replay returns the stored response', () => {
  const replay = subcontract.receiveSubcontract(db, company, order.id, { product_id: finished.id, qty: 2, service_cost: 30, variance: 5, approval_ref: approvalId, landed_cost_ids: [landed.id], idempotency_key: 'sub-receive-1' }, user, null);
  assert.equal(replay.id, receipt.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM subcontract_receipt WHERE order_id=?').get(order.id).n, 1);
});
check('receive idempotency payload mismatch is rejected', () =>
  assert.throws(() => subcontract.receiveSubcontract(db, company, order.id, { product_id: finished.id, qty: 3, idempotency_key: 'sub-receive-1' }, user, null), /idempotency key was reused/));
check('double receive without key is state-blocked', () =>
  assert.throws(() => subcontract.receiveSubcontract(db, company, order.id, { product_id: finished.id, qty: 2 }, user, null), /already received/));

// --- 6. atomicity: failing receive leaves zero Stock/GL/AP residue
const order2 = core.insertResource(db, company, 'subcontract-orders', { id: 'sub-order-2', supplier_id: supplier.id, order_number: 'SUB-VAL-2', qty: 1, service_cost: 10 }, user);
subcontract.issueSubcontract(db, company, order2.id, { lines: [{ product_id: component.id, qty: 2 }] }, user, null);
const snapshot = {
  moves: db.prepare('SELECT COUNT(*) n FROM stock_move').get().n,
  ledger: db.prepare('SELECT COUNT(*) n FROM stock_ledger_line').get().n,
  fiscal: db.prepare('SELECT COUNT(*) n FROM fiscal_doc').get().n,
  arap: db.prepare('SELECT COUNT(*) n FROM arap_document').get().n,
  receipts: db.prepare('SELECT COUNT(*) n FROM subcontract_receipt').get().n,
  audit: db.prepare("SELECT COUNT(*) n FROM x_audit WHERE entity='subcontract_order'").get().n,
};
check('receive with an invalid variance account fails after stock/AP staging', () =>
  assert.throws(() => subcontract.receiveSubcontract(db, company, order2.id, { product_id: finished.id, qty: 1, service_cost: 10, variance: 3, approval_ref: approvalId, variance_account_id: 'coa_does_not_exist' }, user, null)));
check('failed receive leaves zero partial Stock/GL/AP/audit residue', () => {
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_move').get().n, snapshot.moves);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_ledger_line').get().n, snapshot.ledger);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM fiscal_doc').get().n, snapshot.fiscal);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM arap_document').get().n, snapshot.arap);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM subcontract_receipt').get().n, snapshot.receipts);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM x_audit WHERE entity='subcontract_order'").get().n, snapshot.audit);
});
check('variance approval does not leak across orders (record scope)', () =>
  assert.throws(() => subcontract.receiveSubcontract(db, company, order2.id, { product_id: finished.id, qty: 1, service_cost: 10, variance: 3, approval_ref: approvalId }, user, null), /variance requires an approved/));

// --- 7. exact reversal
const finBinBefore = db.prepare("SELECT qty FROM bin WHERE company_id=? AND product_id=? AND location_id='sub-internal'").get(company, finished.id).qty;
const reversal = subcontract.reverseSubcontractReceipt(db, company, receipt.id, {}, user, null);
check('reversal removes finished goods at the receipt valuation', () => {
  assert.ok(reversal.reversal_move_id);
  assert.equal(db.prepare("SELECT qty FROM bin WHERE company_id=? AND product_id=? AND location_id='sub-internal'").get(company, finished.id).qty, finBinBefore - 2);
  const line = db.prepare("SELECT valuation_rate FROM stock_ledger_line WHERE stock_move_id=? AND location_id='sub-internal'").get(reversal.reversal_move_id);
  assert.equal(Number(line.valuation_rate), 41);
});
check('reversal posts an AP debit note for the service cost', () => {
  assert.ok(reversal.debit_note_id);
  const note = db.prepare('SELECT document_kind, total_amount FROM arap_document WHERE id=?').get(reversal.debit_note_id);
  assert.equal(note.document_kind, 'supplier_debit_note');
  assert.equal(note.total_amount, 30);
});
check('variance GL was reversed to net zero', () => {
  const net = db.prepare("SELECT COALESCE(SUM(debit-credit),0) v FROM fiscal_doc_line l JOIN fiscal_doc f ON f.id=l.fiscal_doc_id WHERE f.state='posted' AND l.account_id='coa_501000' AND (l.description LIKE 'Subcontract variance%')").get().v;
  assert.equal(Math.round(net * 100) / 100, 0);
});
check('receipt reversal is idempotent (state-blocked)', () =>
  assert.throws(() => subcontract.reverseSubcontractReceipt(db, company, receipt.id, {}, user, null), /already reversed/));

// --- 8. cross-company scope + audit/worklist evidence
db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('company-sub-other', 'Other');
check('foreign company cannot read the valuation summary', () =>
  assert.throws(() => subcontract.valuationSummary(db, 'company-sub-other', order.id), /outside company scope/));
check('audit + worklist evidence exists for every subcontract action', () => {
  const actions = db.prepare("SELECT DISTINCT action FROM x_audit WHERE entity='subcontract_order'").all().map((row) => row.action);
  for (const expected of ['issued', 'component_return_unused', 'component_scrap', 'component_shortage', 'received', 'receipt_reversed']) assert.ok(actions.includes(expected), `missing audit ${expected}`);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM r3_worklist_item WHERE entity='subcontract_order' AND queue='manufacturing'").get().n >= 6);
});
check('stock valuation equals inventory-control GL for the flow', () => {
  const glNow = db.prepare("SELECT COALESCE(SUM(debit-credit),0) v FROM fiscal_doc_line l JOIN fiscal_doc f ON f.id=l.fiscal_doc_id WHERE l.company_id=? AND l.account_id='coa_104000' AND f.state='posted'").get(company).v;
  const ledgerValue = db.prepare('SELECT COALESCE(SUM(value),0) v FROM stock_ledger_line WHERE company_id=?').get(company).v;
  assert.ok(Math.abs(glNow - ledgerValue) < 0.01, `GL ${glNow} vs ledger ${ledgerValue}`);
});

for (const line of results) console.log(line);
console.log(`R3 SUBCONTRACT VALUATION SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
