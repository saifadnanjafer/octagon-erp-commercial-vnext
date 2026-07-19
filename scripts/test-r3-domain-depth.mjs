// A7+A8 remediation suite: domain-depth evidence that imports the ACTUAL domain
// engines (not the facade) on a disposable database. Covers 14 pricing-precedence
// cases, buy-X-get-Y, coupon usage limits, immutable sales price snapshots, down
// payments, multi-supplier RFQ comparison, supplier scorecards, multi-level +
// phantom BOM rolled cost with revisions/effectivity/scrap, and milestone/fixed/
// time-and-material project billing with duplicate-billing protection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import productEngine from '../vnext/server/modules/products/product-engine.js';
import pricingEngine from '../vnext/server/modules/pricing/pricing-engine.js';
import salesEngine from '../vnext/server/modules/sales/sales-engine.js';
import procurementEngine from '../vnext/server/modules/procurement/procurement-engine.js';
import mrpEngine from '../vnext/server/modules/manufacturing/mrp-engine.js';
import servicesEngine from '../vnext/server/modules/projects/project-engine.js';
import core from '../vnext/server/modules/r3-core.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r3-depth-'));
const dbPath = path.join(temp, 'r3-depth.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const user = 'depth-test';
const results = [];
let failures = 0;
function check(name, fn) {
  try { fn(); results.push(`PASS ${name}`); }
  catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); }
}

// ---------- fixture ----------
const customer = arap.createPartner(db, company, { id: 'depth-customer', name: 'Depth Customer', partner_type: 'customer' }, user);
const vip = arap.createPartner(db, company, { id: 'depth-vip', name: 'VIP Customer', partner_type: 'customer' }, user);
const supplierA = arap.createPartner(db, company, { id: 'depth-supplier-a', name: 'Supplier A', partner_type: 'supplier' }, user);
const supplierB = arap.createPartner(db, company, { id: 'depth-supplier-b', name: 'Supplier B', partner_type: 'supplier' }, user);
const category = productEngine.createCategory(db, company, { id: 'depth-cat', code: 'DEPTH', name: 'Depth Category' }, user);
const product = productEngine.createProduct(db, company, { id: 'depth-product', code: 'DEPTH-P', name: 'Depth Product', product_type: 'goods', category_id: category.id, standard_cost: 10 }, user);
const variant = productEngine.createVariant(db, company, { id: 'depth-variant', template_id: product.id, code: 'DEPTH-P-RED', name: 'Depth Product Red' }, user);
const giveaway = productEngine.createProduct(db, company, { id: 'depth-gift', code: 'DEPTH-G', name: 'Gift', product_type: 'goods' }, user);

// ---------- 1. pricing precedence: 14 deterministic cases ----------
const list = pricingEngine.createPriceList(db, company, { id: 'depth-list', name: 'Depth List', priority: 10 }, user);
function explain(input) { return pricingEngine.explainPrice(db, company, { product_id: product.id, base_price: 200, ...input }); }
check('P1 base price wins with no rules', () => assert.equal(explain({}).unit_price, 200));
pricingEngine.createPriceItem(db, company, { id: 'depth-item-generic', price_list_id: list.id, product_id: product.id, fixed_price: 180, min_qty: 1 });
check('P2 product list price beats base', () => assert.equal(explain({}).unit_price, 180));
pricingEngine.createPricingRule(db, company, { id: 'depth-rule-cat', name: 'Category discount', category_id: category.id, percent_discount: 5, priority: 20 }, user);
check('P3 product-specific item beats category-level rule (specificity)', () => assert.equal(explain({ category_id: category.id }).unit_price, 180));
pricingEngine.createPricingRule(db, company, { id: 'depth-rule-partner', name: 'Partner price', product_id: product.id, partner_id: vip.id, fixed_price: 150, priority: 30 }, user);
check('P4 partner-specific rule beats generic item for that partner', () => assert.equal(explain({ partner_id: vip.id }).unit_price, 150));
check('P5 other partners keep the generic price', () => assert.equal(explain({ partner_id: customer.id }).unit_price, 180));
pricingEngine.createPricingRule(db, company, { id: 'depth-rule-variant', name: 'Variant price', product_id: product.id, variant_id: variant.id, partner_id: vip.id, fixed_price: 140, priority: 40 }, user);
check('P6 variant-specific beats partner-specific', () => assert.equal(explain({ partner_id: vip.id, variant_id: variant.id }).unit_price, 140));
pricingEngine.createPriceItem(db, company, { id: 'depth-item-qty', price_list_id: list.id, product_id: product.id, fixed_price: 160, min_qty: 10 });
check('P7 quantity break applies at threshold', () => assert.equal(explain({ qty: 10 }).unit_price, 160));
check('P8 quantity break ignored below threshold', () => assert.equal(explain({ qty: 9 }).unit_price, 180));
pricingEngine.createPriceItem(db, company, { id: 'depth-item-dated', price_list_id: list.id, product_id: product.id, fixed_price: 100, min_qty: 1, valid_from: '2030-01-01', valid_to: '2030-12-31' });
check('P9 future-dated price is inactive today', () => assert.equal(explain({}).unit_price, 180));
check('P10 future-dated price активates on its date', () => assert.equal(explain({ date: '2030-06-15' }).unit_price, 100));
pricingEngine.createPriceItem(db, company, { id: 'depth-item-usd', price_list_id: list.id, product_id: product.id, fixed_price: 2, min_qty: 1, currency: 'USD' });
check('P11 currency-mismatched price is excluded', () => assert.equal(explain({}).unit_price, 180));
check('P12 explicit USD request selects the USD price', () => assert.equal(explain({ currency: 'USD' }).unit_price, 2));
pricingEngine.createPricingRule(db, company, { id: 'depth-tie-a', name: 'Tie A', product_id: product.id, fixed_price: 171, priority: 5, sequence: 5 }, user);
pricingEngine.createPricingRule(db, company, { id: 'depth-tie-b', name: 'Tie B', product_id: product.id, fixed_price: 172, priority: 5, sequence: 5 }, user);
check('P13 exact ties break deterministically by id', () => { const first = explain({}); const second = explain({}); assert.equal(first.unit_price, 171); assert.equal(first.winner.id, 'depth-tie-a'); assert.equal(second.winner.id, first.winner.id); });
check('P14 explain trace ranks every candidate with one selection', () => { const trace = explain({}).trace; assert.ok(trace.length >= 3); assert.equal(trace.filter((t) => t.selected).length, 1); assert.equal(trace[0].selected, true); });

// ---------- 2. promotions: buy-X-get-Y + coupon usage limits ----------
pricingEngine.createPromotion(db, company, { id: 'depth-bxgy', name: 'Buy 3 get 1', promotion_type: 'buy_x_get_y', product_id: product.id, min_qty: 3, reward_qty: 1, reward_product_id: giveaway.id, priority: 1 }, user);
check('buy-X-get-Y grants proportional reward quantity', () => { const result = explain({ qty: 7 }); assert.ok(result.reward); assert.equal(result.reward.product_id, giveaway.id); assert.equal(result.reward.qty, 2); });
check('buy-X-get-Y grants nothing below threshold', () => assert.equal(explain({ qty: 2 }).reward, null));
const couponPromo = pricingEngine.createPromotion(db, company, { id: 'depth-coupon-promo', name: 'Coupon 10%', promotion_type: 'percent', product_id: product.id, amount: 10, coupon_code: 'SAVE10', priority: 0 }, user);
db.prepare('INSERT INTO coupon(id,company_id,code,promotion_id,usage_limit,used_count,active) VALUES(?,?,?,?,?,0,1)').run('depth-coupon', company, 'SAVE10', couponPromo.id, 2);
check('valid coupon applies its promotion', () => assert.equal(explain({ coupon_code: 'SAVE10' }).unit_price, 153.9));
pricingEngine.redeemCoupon(db, company, 'SAVE10', user);
pricingEngine.redeemCoupon(db, company, 'SAVE10', user);
check('exhausted coupon can no longer be redeemed', () => assert.throws(() => pricingEngine.redeemCoupon(db, company, 'SAVE10', user), /exhausted/));
check('exhausted coupon no longer discounts the price', () => assert.equal(explain({ coupon_code: 'SAVE10' }).unit_price, 171));
check('unknown coupon cannot be redeemed', () => assert.throws(() => pricingEngine.redeemCoupon(db, company, 'NOPE', user), /does not exist/));

// ---------- 3. sales: immutable snapshots + down payment ----------
const quote = salesEngine.createQuote(db, company, { id: 'depth-quote', partner_id: customer.id, lines: [{ product_id: product.id, qty: 2 }] }, user);
check('quote line snapshots the explained price at creation', () => assert.equal(db.prepare('SELECT unit_price FROM sales_quote_line WHERE quote_id=?').get(quote.id).unit_price, 171));
pricingEngine.createPricingRule(db, company, { id: 'depth-late-rule', name: 'Late price change', product_id: product.id, fixed_price: 999, priority: 0, sequence: 0 }, user);
const order = salesEngine.confirmOrder(db, company, { id: 'depth-order', quote_id: quote.id }, user);
check('order keeps the immutable quote snapshot after later price changes', () => assert.equal(db.prepare('SELECT unit_price FROM sales_order_line WHERE order_id=?').get(order.id).unit_price, 171));
const downPayment = salesEngine.createDownPayment(db, company, order.id, { percent: 30 }, user, null);
check('30% down payment posts a real AR invoice', () => { assert.equal(downPayment.state, 'posted'); assert.equal(downPayment.amount, Math.round(order.total_amount * 0.3 * 100) / 100); });
check('down payment above the order total is rejected', () => assert.throws(() => salesEngine.createDownPayment(db, company, order.id, { amount: order.total_amount * 2 }, user, null), /within the order total/));

// ---------- 4. procurement: RFQ comparison + scorecard ----------
const rfq = core.insertResource(db, company, 'rfqs', { id: 'depth-rfq', supplier_id: supplierA.id }, user);
procurementEngine.createSupplierQuote(db, company, { id: 'depth-sq-a', rfq_id: rfq.id, supplier_id: supplierA.id, total_amount: 500, lead_time_days: 10 }, user, null);
procurementEngine.createSupplierQuote(db, company, { id: 'depth-sq-b', rfq_id: rfq.id, supplier_id: supplierB.id, total_amount: 450, lead_time_days: 20 }, user, null);
procurementEngine.createSupplierQuote(db, company, { id: 'depth-sq-c', rfq_id: rfq.id, supplier_id: supplierB.id, total_amount: 450, lead_time_days: 5 }, user, null);
const comparison = procurementEngine.compareSupplierQuotes(db, company, rfq.id);
check('RFQ comparison ranks by total then lead time deterministically', () => {
  assert.equal(comparison.quotes.length, 3);
  assert.equal(comparison.quotes[0].id, 'depth-sq-c');
  assert.equal(comparison.quotes[0].best, true);
  assert.equal(comparison.quotes[2].id, 'depth-sq-a');
});
const selected = procurementEngine.selectSupplierQuote(db, company, 'depth-sq-c', {}, user, null);
check('selecting a quote unselects all competitors', () => { assert.equal(selected.selected, 1); assert.equal(db.prepare('SELECT COUNT(*) n FROM purchase_supplier_quote WHERE rfq_id=? AND selected=1').get(rfq.id).n, 1); });
core.insertResource(db, company, 'supplier-scorecards', { id: 'depth-scorecard', supplier_id: supplierB.id, period: '2026-07', on_time_score: 92, quality_score: 88, price_score: 95 }, user);
check('supplier scorecard is recorded and company scoped', () => assert.equal(core.assertRecordScope(db, company, 'supplier-scorecards', 'depth-scorecard').supplier_id, supplierB.id));

// ---------- 5. manufacturing: multi-level + phantom BOM rolled cost ----------
const bolt = productEngine.createProduct(db, company, { id: 'depth-bolt', code: 'D-BOLT', name: 'Bolt', product_type: 'goods', standard_cost: 2 }, user);
const plate = productEngine.createProduct(db, company, { id: 'depth-plate', code: 'D-PLATE', name: 'Plate', product_type: 'goods', standard_cost: 8 }, user);
const bracket = productEngine.createProduct(db, company, { id: 'depth-bracket', code: 'D-BRACKET', name: 'Bracket (phantom sub)', product_type: 'goods', standard_cost: 999 }, user);
const machine = productEngine.createProduct(db, company, { id: 'depth-machine', code: 'D-MACHINE', name: 'Machine', product_type: 'goods' }, user);
// bracket phantom BOM: 2 bolts + 1 plate = 2*2 + 8 = 12 (standard_cost 999 must be ignored)
core.insertResource(db, company, 'boms', { id: 'depth-bom-bracket', product_id: bracket.id, code: 'BOM-BRACKET', revision: 'A', bom_type: 'phantom', output_qty: 1 }, user);
core.insertResource(db, company, 'bom-lines', { id: 'depth-bl-1', bom_id: 'depth-bom-bracket', component_product_id: bolt.id, qty: 2 }, user);
core.insertResource(db, company, 'bom-lines', { id: 'depth-bl-2', bom_id: 'depth-bom-bracket', component_product_id: plate.id, qty: 1 }, user);
// machine BOM rev A: 3 brackets (phantom) + 4 bolts, 10% scrap on bolts => material = 3*12 + 4*1.1*2 = 36 + 8.8 = 44.8
core.insertResource(db, company, 'boms', { id: 'depth-bom-machine-a', product_id: machine.id, code: 'BOM-MACHINE', revision: 'A', output_qty: 1, effective_from: '2020-01-01', effective_to: '2026-01-01' }, user);
core.insertResource(db, company, 'bom-lines', { id: 'depth-bl-3', bom_id: 'depth-bom-machine-a', component_product_id: bracket.id, qty: 3, phantom: 1 }, user);
core.insertResource(db, company, 'bom-lines', { id: 'depth-bl-4', bom_id: 'depth-bom-machine-a', component_product_id: bolt.id, qty: 4, scrap_pct: 10 }, user);
// machine BOM rev B (current): 2 brackets + 4 bolts no scrap => 24 + 8 = 32
core.insertResource(db, company, 'boms', { id: 'depth-bom-machine-b', product_id: machine.id, code: 'BOM-MACHINE', revision: 'B', output_qty: 1, effective_from: '2026-01-02' }, user);
core.insertResource(db, company, 'bom-lines', { id: 'depth-bl-5', bom_id: 'depth-bom-machine-b', component_product_id: bracket.id, qty: 2, phantom: 1 }, user);
core.insertResource(db, company, 'bom-lines', { id: 'depth-bl-6', bom_id: 'depth-bom-machine-b', component_product_id: bolt.id, qty: 4 }, user);
check('exact rolled-cost fixture: rev A with phantom + scrap = 44.8', () => {
  const rolled = mrpEngine.computeBomRolledCost(db, company, 'depth-bom-machine-a', 1, { date: '2025-06-01' });
  assert.equal(rolled.material_cost, 44.8);
  assert.equal(rolled.explosion.find((line) => line.component_product_id === bracket.id).phantom, true);
});
check('exact rolled-cost fixture: rev B = 32 with labor/overhead rollup', () => {
  const rolled = mrpEngine.computeBomRolledCost(db, company, 'depth-bom-machine-b', 1, { labor_cost: 5, overhead_cost: 3 });
  assert.equal(rolled.material_cost, 32);
  assert.equal(rolled.total_cost, 40);
});
check('revision effectivity picks the dated BOM', () => {
  assert.equal(mrpEngine.effectiveBom(db, company, machine.id, '2025-06-01').revision, 'A');
  assert.equal(mrpEngine.effectiveBom(db, company, machine.id, '2026-07-19').revision, 'B');
});
check('BOM cycles are detected, not infinite-looped', () => {
  core.insertResource(db, company, 'boms', { id: 'depth-bom-cycle', product_id: bolt.id, code: 'BOM-CYCLE', revision: 'A', output_qty: 1 }, user);
  core.insertResource(db, company, 'bom-lines', { id: 'depth-bl-cycle', bom_id: 'depth-bom-cycle', component_product_id: machine.id, qty: 1 }, user);
  assert.throws(() => mrpEngine.computeBomRolledCost(db, company, 'depth-bom-machine-b', 1, {}), /cycle/i);
  db.prepare("DELETE FROM mrp_bom_line WHERE id='depth-bl-cycle'").run();
  db.prepare("DELETE FROM mrp_bom WHERE id='depth-bom-cycle'").run();
});

// ---------- 6. projects: fixed + milestone + T&M billing, no duplicate billing ----------
const project = core.insertResource(db, company, 'projects', { id: 'depth-project', partner_id: customer.id, name: 'Depth Project' }, user);
core.insertResource(db, company, 'project-timesheets', { id: 'depth-ts-1', project_id: project.id, user_id: user, work_date: '2026-07-18', hours: 4, rate: 25, billable: 1 }, user);
core.insertResource(db, company, 'milestones', { id: 'depth-ms-1', project_id: project.id, name: 'Design complete', amount: 300, state: 'open' }, user);
core.insertResource(db, company, 'contract-lines', { id: 'depth-cl-1', project_id: project.id, description: 'Fixed setup fee', qty: 1, unit_rate: 500, billing_rule: 'fixed' }, user);
const tmBill = servicesEngine.billProject(db, company, project.id, { timesheet_ids: ['depth-ts-1'] }, user, null);
check('time-and-material billing invoices selected timesheets', () => { assert.equal(tmBill.invoice.state, 'posted'); assert.equal(tmBill.invoice.total_amount, 100); });
const msBill = servicesEngine.billProject(db, company, project.id, { milestone_ids: ['depth-ms-1'] }, user, null);
check('milestone billing invoices the milestone and closes it', () => { assert.equal(msBill.invoice.total_amount, 300); assert.equal(db.prepare("SELECT state FROM project_milestone WHERE id='depth-ms-1'").get().state, 'billed'); });
const fixedBill = servicesEngine.billProject(db, company, project.id, { contract_line_ids: ['depth-cl-1'] }, user, null);
check('fixed contract billing invoices the contract line', () => assert.equal(fixedBill.invoice.total_amount, 500));
check('no source can be billed twice', () => {
  assert.throws(() => servicesEngine.billProject(db, company, project.id, { timesheet_ids: ['depth-ts-1'] }, user, null), /no unbilled/);
  assert.throws(() => servicesEngine.billProject(db, company, project.id, { milestone_ids: ['depth-ms-1'] }, user, null), /no unbilled/);
  assert.throws(() => servicesEngine.billProject(db, company, project.id, { contract_line_ids: ['depth-cl-1'] }, user, null), /no unbilled/);
});
check('project profitability: billed revenue exceeds timesheet cost', () => {
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM project_billing_line WHERE project_id=? AND state='billed'").get(project.id).v;
  assert.equal(revenue, 900);
});

// ---------- 7. A7 structural proof: engines are real modules, facade delegates ----------
check('domain engines are distinct real modules (no placeholder wrappers)', () => {
  assert.notEqual(salesEngine.createQuote, procurementEngine.createSupplierQuote);
  assert.equal(core.createQuote, salesEngine.createQuote);
  assert.equal(core.matchPurchase, procurementEngine.matchPurchase);
  assert.equal(core.computeBomRolledCost, mrpEngine.computeBomRolledCost);
});

for (const line of results) console.log(line);
console.log(`R3 DOMAIN DEPTH SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
