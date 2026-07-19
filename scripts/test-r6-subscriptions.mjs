// R6.2 focused acceptance: disposable DB only. Proves plans, lifecycle,
// proration math, billing runs, dunning ladders, MRR/churn KPIs,
// and migration rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import sub from '../vnext/server/modules/subscriptions/subscription-engine.js';
import { mountSubscriptionRoutes } from '../vnext/server/modules/subscriptions/subscription-routes.js';
import arap from '../vnext/server/finance/arap-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r6-sub-'));
const dbPath = path.join(temp, 'r6-sub.db');
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

function clearInvoiceAndFinanceData(db) {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete;');
  try {
    db.prepare('DELETE FROM gl_line').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM dunning_action').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM subscription_invoice').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM payment_allocation').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM payment').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM fiscal_doc_line').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM arap_document').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM fiscal_doc').run();
  } catch (_) {}
  
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS t_gl_line_no_delete BEFORE DELETE ON gl_line
    BEGIN
      SELECT RAISE(FAIL, 'Deletes not allowed on append-only GL lines');
    END;
  `);
  db.exec('PRAGMA foreign_keys = ON;');
}

const company = 'company-r0-demo';
db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('company-r6-other', 'Other R6 Company');

// Setup standard accounts for secondary company to prevent scope errors if tested
const nowIso = new Date().toISOString();
db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run('coa_103000_other', 'company-r6-other', '103000', 'Receivables', 'receivable', null, nowIso);
db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run('coa_201000_other', 'company-r6-other', '201000', 'Payables', 'payable', null, nowIso);
db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run('coa_401000_other', 'company-r6-other', '401000', 'Sales', 'income', null, nowIso);
db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run('coa_501000_other', 'company-r6-other', '501000', 'COGS', 'expense', null, nowIso);

// Create partners
const partner1 = arap.createPartner(db, company, { id: 'partner-1', name: 'Partner 1', partner_type: 'customer' }, 'system');
const partnerOther = arap.createPartner(db, 'company-r6-other', { id: 'partner-other', name: 'Other Customer', partner_type: 'customer', receivable_account_id: 'coa_103000_other', payable_account_id: 'coa_201000_other' }, 'system');

// Create products
const product1 = arap.createProduct(db, company, { id: 'product-1', name: 'Premium SaaS Plan', code: 'SAAS-PREM' }, 'system');
const productOther = arap.createProduct(db, 'company-r6-other', { id: 'product-other', name: 'Other Product', code: 'OTHER', income_account_id: 'coa_401000_other', expense_account_id: 'coa_501000_other' }, 'system');

// 1. Create plans
const planBasic = sub.createPlan(db, company, { id: 'plan-basic', name: 'Basic SaaS', interval: 'monthly', amount: 50000, product_id: product1.id, trial_days: 0 }, 'system');
const planPremium = sub.createPlan(db, company, { id: 'plan-premium', name: 'Premium SaaS', interval: 'monthly', amount: 150000, product_id: product1.id, trial_days: 0 }, 'system');
const planTrial = sub.createPlan(db, company, { id: 'plan-trial', name: 'Trial SaaS', interval: 'monthly', amount: 100000, product_id: product1.id, trial_days: 14 }, 'system');
const planOther = sub.createPlan(db, 'company-r6-other', { id: 'plan-other', name: 'Other SaaS', interval: 'monthly', amount: 80000, product_id: productOther.id }, 'system');

check('plans are created and retrieved under company scope', () => {
  assert.equal(planBasic.amount, 50000);
  assert.equal(planPremium.name, 'Premium SaaS');
  assert.equal(planTrial.trial_days, 14);
  
  const list = sub.listPlans(db, company);
  assert.equal(list.length, 3);
  
  const retrieved = sub.getPlan(db, company, 'plan-basic');
  assert.equal(retrieved.name, 'Basic SaaS');
  
  // Plan name validation
  assert.throws(() => sub.createPlan(db, company, { name: '', amount: 10000 }, 'system'), /plan name is required/);
  // Negative amount validation
  assert.throws(() => sub.createPlan(db, company, { name: 'Invalid', amount: -10 }, 'system'), /plan amount must be non-negative/);
  // Interval check
  assert.throws(() => sub.createPlan(db, company, { name: 'Invalid', amount: 1000, interval: 'weekly' }, 'system'), /interval must be monthly or yearly/);
});

// 2. Create subscriptions
const sub1 = sub.createSubscription(db, company, { id: 'sub-1', plan_id: planBasic.id, partner_id: partner1.id, start_date: '2026-07-19' }, 'system');
const subTrial = sub.createSubscription(db, company, { id: 'sub-trial', plan_id: planTrial.id, partner_id: partner1.id, start_date: '2026-07-19' }, 'system');

check('subscriptions are created with correct state and billing dates', () => {
  assert.equal(sub1.state, 'active');
  assert.equal(sub1.next_bill_date, '2026-07-19');
  assert.equal(sub1.trial_end_date, null);
  
  assert.equal(subTrial.state, 'trial');
  assert.equal(subTrial.trial_end_date, '2026-08-02'); // 2026-07-19 + 14 days
  assert.equal(subTrial.next_bill_date, '2026-08-02');
  
  // Cross-company scope check
  assert.throws(() => sub.createSubscription(db, company, { plan_id: planOther.id, partner_id: partner1.id }, 'system'), /plan is missing, inactive, or outside company scope/);
  assert.throws(() => sub.createSubscription(db, company, { plan_id: planBasic.id, partner_id: partnerOther.id }, 'system'), /partner is missing or outside company scope/);
});

// 3. Billing run
check('billing run creates invoices and advances bill date', () => {
  const result = sub.runBilling(db, company, '2026-07-19', 'system');
  assert.equal(result.billed.length, 1);
  assert.equal(result.billed[0].subscription_id, 'sub-1');
  assert.equal(result.billed[0].amount, 50000);
  assert.equal(result.billed[0].period_key, '2026-07-19');
  
  // Verify subscription is updated
  const updated = sub.getSubscription(db, company, 'sub-1');
  assert.equal(updated.next_bill_date, '2026-08-19'); // 2026-07-19 + 1 month
  
  // Verify invoice table and posted AR document
  const invCount = db.prepare('SELECT COUNT(*) n FROM subscription_invoice WHERE subscription_id = ?').get('sub-1').n;
  assert.equal(invCount, 1);
  
  const arapDoc = db.prepare('SELECT * FROM arap_document WHERE id = ?').get(result.billed[0].arap_document_id);
  assert.equal(arapDoc.total_amount, 50000);
});

check('billing run is idempotent and does not double-bill', () => {
  // Re-run for the same date
  const result = sub.runBilling(db, company, '2026-07-19', 'system');
  assert.equal(result.billed.length, 0); // No new bills should be created
});

// 4. Subscription mid-cycle change (Proration)
check('upgrade mid-cycle calculates proration and posts an immediate invoice', () => {
  // We are on 2026-07-29 (10 days into a 31-day cycle starting 2026-07-19 ending 2026-08-19)
  // Remaining days: 21 days
  // Basic: 50,000, Premium: 150,000
  // Difference: 100,000
  // Proration charge: 100,000 * (21 / 31) = 67,741.94 -> rounded to 67741.94
  
  const updated = sub.changeSubscription(db, company, 'sub-1', planPremium.id, '2026-07-29', 'system');
  assert.equal(updated.plan_id, planPremium.id);
  assert.equal(updated.current_amount, 150000);
  assert.equal(updated.next_bill_date, '2026-08-19'); // anchor billing date remains unchanged
  
  // Check that subscription_change row is logged
  const change = db.prepare('SELECT * FROM subscription_change WHERE subscription_id = ?').get('sub-1');
  assert.equal(change.change_type, 'upgrade');
  assert.equal(change.from_plan_id, planBasic.id);
  assert.equal(change.to_plan_id, planPremium.id);
  assert.equal(change.proration_amount, 67741.94);
  
  // Verify immediate invoice posted
  const inv = db.prepare("SELECT * FROM subscription_invoice WHERE subscription_id = ? AND period_key LIKE 'prorate-%'").get('sub-1');
  assert.ok(inv);
  assert.equal(inv.amount, 67741.94);
  
  const doc = db.prepare('SELECT state FROM fiscal_doc WHERE id = (SELECT fiscal_doc_id FROM arap_document WHERE id = ?)').get(inv.arap_document_id);
  assert.equal(doc.state, 'posted');
});

check('downgrade mid-cycle calculates proration and posts an immediate credit note', () => {
  // Premium: 150,000, Basic: 50,000
  // Cycle remaining: 21 days (still as of 2026-07-29)
  // Difference: -100,000
  // Proration: -100,000 * (21 / 31) = -67,741.94
  
  const updated = sub.changeSubscription(db, company, 'sub-1', planBasic.id, '2026-07-29', 'system');
  assert.equal(updated.plan_id, planBasic.id);
  assert.equal(updated.current_amount, 50000);
  
  const change = db.prepare("SELECT * FROM subscription_change WHERE subscription_id = ? AND change_type = 'downgrade'").get('sub-1');
  assert.ok(change);
  assert.equal(change.proration_amount, -67741.94);
  
  const inv = db.prepare("SELECT * FROM subscription_invoice WHERE subscription_id = ? AND amount < 0").get('sub-1');
  assert.ok(inv);
  
  const arapDoc = db.prepare('SELECT * FROM arap_document WHERE id = ?').get(inv.arap_document_id);
  assert.equal(arapDoc.document_kind, 'customer_credit_note');
  assert.equal(arapDoc.total_amount, 67741.94);
});

// 5. Dunning ladder
check('dunning ladder triggers reminders based on overdue dates', () => {
  clearInvoiceAndFinanceData(db);

  // Reset subscription to active for a clean start
  db.prepare("UPDATE subscription SET state = 'active' WHERE id = 'sub-1'").run();

  // Let's create an overdue invoice directly to test dunning
  const overdueInvoice = arap.createArapDocument(db, company, {
    document_kind: 'customer_invoice',
    partner_id: partner1.id,
    doc_date: '2026-06-01',
    due_date: '2026-06-10',
    lines: [{ quantity: 1, price_unit: 200000, description: 'Overdue bill' }]
  }, 'system');
  arap.postArapDocument(db, overdueInvoice.id, 'system');
  
  // Link it to sub-1
  db.prepare(`
    INSERT INTO subscription_invoice (id, company_id, subscription_id, period_key, arap_document_id, amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('sub-inv-overdue', company, 'sub-1', '2026-06-01', overdueInvoice.id, 200000, nowIso);
  
  // Run dunning as of 2026-06-12 (2 days overdue) -> No rung should be triggered (needs >= 5 days)
  const d1 = sub.runDunning(db, company, '2026-06-12', {}, 'system');
  assert.equal(d1.actions.length, 0);
  
  // Run dunning as of 2026-06-16 (6 days overdue) -> Rung 1 Friendly Reminder
  const d2 = sub.runDunning(db, company, '2026-06-16', {}, 'system');
  assert.equal(d2.actions.length, 1);
  assert.equal(d2.actions[0].rung, 1);
  assert.equal(d2.actions[0].name, 'Friendly Reminder');
  
  // Run dunning as of 2026-07-02 (22 days overdue) -> Rung 2 Second Warning
  const d3 = sub.runDunning(db, company, '2026-07-02', {}, 'system');
  assert.equal(d3.actions.length, 1);
  assert.equal(d3.actions[0].rung, 2);
  
  // Run dunning as of 2026-07-15 (35 days overdue) -> Rung 3 Suspension Warning and subscription becomes suspended
  const d4 = sub.runDunning(db, company, '2026-07-15', {}, 'system');
  assert.equal(d4.actions.length, 1);
  assert.equal(d4.actions[0].rung, 3);
  
  const subSuspended = sub.getSubscription(db, company, 'sub-1');
  assert.equal(subSuspended.state, 'suspended');
  
  // Run dunning as of 2026-07-30 (50 days overdue) -> Rung 4 Cancellation and Termination and subscription becomes cancelled
  const d5 = sub.runDunning(db, company, '2026-07-30', {}, 'system');
  assert.equal(d5.actions.length, 1);
  assert.equal(d5.actions[0].rung, 4);
  
  const subCancelled = sub.getSubscription(db, company, 'sub-1');
  assert.equal(subCancelled.state, 'cancelled');
  assert.equal(subCancelled.cancelled_at, '2026-07-30');
});

check('dunning ladder interest option posts a separate interest charge invoice', () => {
  clearInvoiceAndFinanceData(db);

  // Reset subscription to active for a clean start
  db.prepare("UPDATE subscription SET state = 'active' WHERE id = 'sub-1'").run();
  
  // Create another overdue invoice
  const overdueInvoice = arap.createArapDocument(db, company, {
    document_kind: 'customer_invoice',
    partner_id: partner1.id,
    doc_date: '2026-06-01',
    due_date: '2026-06-10',
    lines: [{ quantity: 1, price_unit: 100000, description: 'Overdue bill 2' }]
  }, 'system');
  arap.postArapDocument(db, overdueInvoice.id, 'system');
  
  // Run dunning as of 2026-06-16 (6 days overdue) with 2% interest rate
  const result = sub.runDunning(db, company, '2026-06-16', { chargeInterest: true, interestRate: 0.02 }, 'system');
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].rung, 1);
  assert.ok(result.actions[0].interest_arap_id);
  
  const interestInvoice = db.prepare('SELECT * FROM arap_document WHERE id = ?').get(result.actions[0].interest_arap_id);
  assert.equal(interestInvoice.total_amount, 2000); // 100000 * 0.02
});

// 6. KPIs
check('MRR and Churn KPIs calculate correctly', () => {
  // Clear tables that reference subscription
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.prepare('DELETE FROM dunning_action').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM subscription_invoice').run();
  } catch (_) {}
  try {
    db.prepare('DELETE FROM subscription_change').run();
  } catch (_) {}
  try {
    db.prepare("DELETE FROM subscription").run();
  } catch (_) {}
  db.exec('PRAGMA foreign_keys = ON;');

  // Let's create two active subscriptions
  // plan Basic (50,000), plan Premium (150,000)
  sub.createSubscription(db, company, { id: 'kpi-sub-1', plan_id: planBasic.id, partner_id: partner1.id, start_date: '2026-07-19' }, 'system');
  sub.createSubscription(db, company, { id: 'kpi-sub-2', plan_id: planPremium.id, partner_id: partner1.id, start_date: '2026-07-19' }, 'system');
  
  // Cancel one as of 2026-07-25
  sub.cancelSubscription(db, company, 'kpi-sub-1', '2026-07-25', 'system');
  
  const kpis = sub.getSubscriptionKPIs(db, company, '2026-07-28');
  assert.equal(kpis.active_count, 1); // only kpi-sub-2 is active
  assert.equal(kpis.mrr, 150000); // only kpi-sub-2 contributes
  assert.equal(kpis.churned_count, 1); // kpi-sub-1 cancelled in last 30 days
  assert.equal(kpis.churn_rate_percent, 50); // 1 cancelled / (1 active + 1 cancelled) = 50%
});

// 7. Route and HTTP mounting verification
check('subscription route handlers enforce company scope and permissions', async () => {
  const routes = mountSubscriptionRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-1', groups: ['sales.manager'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: (user, perm) => {
      // Simulate permission checks
      return perm === 'subscription:view';
    }
  });
  
  // Helper to trigger request
  async function testRoute(method, pathname, bodyData = null) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    const processed = routes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET lists plans (requires subscription:view, which is granted)
  const r1 = await testRoute('GET', '/api/x/subscriptions/plans');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  assert.equal(r1.res.body.success, true);
  
  // POST creates plan (requires subscription:manage, which is not granted)
  const r2 = await testRoute('POST', '/api/x/subscriptions/plans', { name: 'SaaS Large', amount: 300000 });
  assert.equal(r2.processed, true);
  assert.equal(r2.res.statusCode, 403);
  assert.equal(r2.res.body.success, false);
});

// 8. Migration down test
// Clear all data first to satisfy foreign key constraints during table drops/rebuilds
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete;');
try { db.prepare('DELETE FROM gl_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM dunning_action').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_invoice').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_change').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_plan').run(); } catch (_) {}
try { db.prepare('DELETE FROM payment_allocation').run(); } catch (_) {}
try { db.prepare('DELETE FROM payment').run(); } catch (_) {}
try { db.prepare('DELETE FROM fiscal_doc_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM arap_document').run(); } catch (_) {}
try { db.prepare('DELETE FROM fiscal_doc').run(); } catch (_) {}
try { db.prepare('DELETE FROM partner_master').run(); } catch (_) {}
try { db.prepare('DELETE FROM product_master').run(); } catch (_) {}
try { db.prepare('DELETE FROM account').run(); } catch (_) {}
try { db.prepare('DELETE FROM companies').run(); } catch (_) {}
try { db.prepare('DELETE FROM r3_worklist_item').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 632 down restores the subscription schema boundary', () => {
  assert.ok(down.migrations.includes('632_r6_subscriptions'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='subscription'").get(), undefined);
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='subscription_plan'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR6 SUBSCRIPTION SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
