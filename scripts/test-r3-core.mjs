// R3 focused disposable-database suite; no production paths or customer data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import core from '../vnext/server/modules/r3-core.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r3-core-'));
const dbPath = path.join(temp, 'r3.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const otherCompany = 'company-r3-other';
const checks = [];
function check(name, fn) { try { fn(); checks.push(`PASS ${name}`); } catch (error) { checks.push(`FAIL ${name}: ${error.message}`); throw error; } }

db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run(otherCompany, 'Other R3 Company');
const customer = arap.createPartner(db, company, { id: 'r3-customer', name: 'R3 Customer', partner_type: 'customer' }, 'r3-test');
const category = core.createCategory(db, company, { id: 'r3-cat', code: 'GOODS', name: 'Goods' }, 'r3-test');
db.prepare('INSERT INTO uom_category(id,company_id,name,created_at,created_by) VALUES(?,?,?,?,?)').run('r3-uom-cat', company, 'Units', core.now(), 'r3-test');
const uom = core.createUom(db, company, { id: 'r3-uom', category_id: 'r3-uom-cat', name: 'Piece', symbol: 'pc', factor: 1 });
const product = core.createProduct(db, company, { id: 'r3-product', code: 'R3-PRODUCT', name: 'R3 Product', category_id: category.id, base_uom_id: uom.id, barcode: 'R3-0001', product_type: 'goods' }, 'r3-test');
check('R3.1 reuses canonical product_master', () => assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_master WHERE id=?').get(product.id).n, 1));
check('R3.1 goods/services behavior', () => assert.equal(product.stockable, 1));
check('R3.1 duplicate barcode rejected', () => assert.throws(() => core.createProduct(db, company, { code: 'R3-DUP', name: 'Duplicate', barcode: 'R3-0001' }, 'r3-test')));
core.createBarcode(db, company, { id: 'r3-barcode', product_id: product.id, barcode: 'R3-0002' });

const priceList = core.createPriceList(db, company, { id: 'r3-retail', name: 'Retail', priority: 10 }, 'r3-test');
core.createPriceItem(db, company, { id: 'r3-price-item', price_list_id: priceList.id, product_id: product.id, uom_id: uom.id, fixed_price: 125, min_qty: 1 });
core.createPricingRule(db, company, { id: 'r3-partner-rule', name: 'Customer override', product_id: product.id, partner_id: customer.id, fixed_price: 100, priority: 1, sequence: 1 });
const explanation = core.explainPrice(db, company, { product_id: product.id, partner_id: customer.id, uom_id: uom.id, qty: 2, base_price: 200 });
check('R3.1 pricing precedence winner and trace', () => { assert.equal(explanation.unit_price, 100); assert.equal(explanation.trace.length, 2); assert.equal(explanation.trace[0].selected, true); });
check('R3.1 cross-company product scope', () => assert.throws(() => core.explainPrice(db, otherCompany, { product_id: product.id, base_price: 1 }), /outside company scope|missing/));

const quote = core.createQuote(db, company, { id: 'r3-quote', partner_id: customer.id, idempotency_key: 'r3-quote-key', lines: [{ product_id: product.id, qty: 2, base_price: 200 }] }, 'r3-test');
const order = core.confirmOrder(db, company, { id: 'r3-order', quote_id: quote.id, idempotency_key: 'r3-order-key' }, 'r3-test');
const invoice = core.invoiceOrder(db, company, order.id, {}, 'r3-test');
check('R3.2 golden sales flow quote-order-invoice', () => { assert.equal(order.state, 'confirmed'); assert.equal(invoice.state, 'posted'); assert.equal(invoice.total_amount, 200); });
check('R3.2 quote idempotency', () => assert.equal(core.createQuote(db, company, { partner_id: customer.id, idempotency_key: 'r3-quote-key', lines: [{ product_id: product.id, qty: 2, base_price: 200 }] }, 'r3-test').replayed, true));
check('R3.2 idempotency payload mismatch is rejected', () => assert.throws(() => core.createQuote(db, company, { partner_id: customer.id, idempotency_key: 'r3-quote-key', lines: [{ product_id: product.id, qty: 3, base_price: 200 }] }, 'r3-test'), /idempotency key was reused/));
const otherCustomer = arap.createPartner(db, otherCompany, { id: 'r3-other-customer', name: 'Other R3 Customer', partner_type: 'customer' }, 'r3-test');
const otherProduct = core.createProduct(db, otherCompany, { id: 'r3-other-product', code: 'R3-OTHER-PRODUCT', name: 'Other R3 Product', product_type: 'goods' }, 'r3-test');
check('R3 record ACL permits an in-company record', () => assert.equal(core.assertRecordScope(db, company, 'products', product.id).id, product.id));
check('R3 record ACL denies a foreign-company record', () => assert.throws(() => core.assertRecordScope(db, company, 'products', otherProduct.id), /outside company scope/));
const scopedQuoteA = core.createQuote(db, company, { id: 'r3-scoped-quote-a', partner_id: customer.id, idempotency_key: 'same-cross-company-key', lines: [{ product_id: product.id, qty: 1, base_price: 10 }] }, 'r3-test');
const scopedQuoteB = core.createQuote(db, otherCompany, { id: 'r3-scoped-quote-b', partner_id: otherCustomer.id, idempotency_key: 'same-cross-company-key', lines: [{ product_id: otherProduct.id, qty: 1, base_price: 20 }] }, 'r3-test');
check('R3.2 idempotency key is isolated by company and tenant scope', () => { assert.equal(scopedQuoteA.replayed, undefined); assert.equal(scopedQuoteB.replayed, undefined); assert.notEqual(scopedQuoteA.id, scopedQuoteB.id); });

db.prepare('INSERT INTO warehouses(warehouse_id,company_id,name) VALUES(?,?,?)').run('r3-wh', company, 'R3 Warehouse');
db.prepare('INSERT INTO locations(location_id,warehouse_id,company_id,name,type) VALUES(?,?,?,?,?)').run('r3-loc', 'r3-wh', company, 'R3 Location', 'internal');
const req = core.insertResource(db, company, 'requisitions', { id: 'r3-req', requester_id: 'r3-test', notes: 'Need product' }, 'r3-test');
const po = core.insertResource(db, company, 'purchase-orders', { id: 'r3-po', supplier_id: customer.id, order_number: 'PO-R3', currency: 'IQD' }, 'r3-test');
const reservation = core.insertResource(db, company, 'reservations', { id: 'r3-res', product_id: product.id, location_id: 'r3-loc', demand_ref: order.id, qty: 2 }, 'r3-test');
const bom = core.insertResource(db, company, 'boms', { id: 'r3-bom', product_id: product.id, code: 'BOM-R3', revision: 'A' }, 'r3-test');
const wc = core.insertResource(db, company, 'work-centers', { id: 'r3-wc', code: 'WC-R3', name: 'R3 Workshop', hourly_cost: 10 }, 'r3-test');
const wo = core.insertResource(db, company, 'work-orders', { id: 'r3-wo', bom_id: bom.id, product_id: product.id, order_number: 'WO-R3', qty: 1 }, 'r3-test');
core.transitionResource(db, company, 'work-orders', wo.id, 'confirmed', 'r3-test');
check('R3.3 procurement records', () => { assert.equal(req.company_id, company); assert.equal(po.order_number, 'PO-R3'); });
check('R3.4 reservation is company scoped', () => assert.equal(reservation.reserved_qty, 0));
check('R3.5 manufacturing BOM/work-order', () => assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mrp_bom WHERE id=?').get(bom.id).n, 1));
const landed = core.insertResource(db, company, 'landed-costs', { id: 'r3-landed', name: 'Freight', total_amount: 25, allocation_basis: 'value' }, 'r3-test');
const subcontract = core.insertResource(db, company, 'subcontract-orders', { id: 'r3-sub', supplier_id: customer.id, order_number: 'SUB-R3', qty: 1, service_cost: 50 }, 'r3-test');
check('R3.6 landed/subcontracting', () => { assert.equal(landed.total_amount, 25); assert.equal(subcontract.order_number, 'SUB-R3'); });
const project = core.insertResource(db, company, 'projects', { id: 'r3-project', name: 'R3 Project', partner_id: customer.id }, 'r3-test');
const task = core.insertResource(db, company, 'tasks', { id: 'r3-task', project_id: project.id, title: 'R3 Task' }, 'r3-test');
const timesheet = core.insertResource(db, company, 'project-timesheets', { id: 'r3-ts', project_id: project.id, task_id: task.id, user_id: 'r3-test', work_date: '2026-07-18', hours: 2, rate: 25 }, 'r3-test');
const ticket = core.insertResource(db, company, 'tickets', { id: 'r3-ticket', title: 'R3 Support', partner_id: customer.id, opened_at: core.now() }, 'r3-test');
check('R3.7 project and separate timesheet', () => { assert.equal(timesheet.hours, 2); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='employee_timesheets'").get().n, 0); });
check('R3.7 helpdesk ticket', () => assert.equal(ticket.state, 'open'));
check('R3 atomic command rollback removes partial worklist writes', () => { const before = db.prepare('SELECT COUNT(*) AS n FROM r3_worklist_item WHERE company_id=?').get(company).n; assert.throws(() => core.atomic(db, () => { db.prepare('INSERT INTO r3_worklist_item(id,company_id,entity,record_id,queue,assignee_id,state,created_at) VALUES(?,?,?,?,?,?,?,?)').run('r3-atomic-probe', company, 'probe', 'r3-probe', 'probe', null, 'open', core.now()); throw new Error('forced atomic rollback'); }), /forced atomic rollback/); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM r3_worklist_item WHERE company_id=?').get(company).n, before); });
check('R3.8 integrity and FK', () => { assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0); });

console.log(checks.join('\n'));
console.log(`R3 CORE SUITE: ${checks.length} PASS, 0 FAIL, 0 SKIP`);
db.close();
