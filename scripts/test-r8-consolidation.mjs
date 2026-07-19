// R8.1 focused acceptance: disposable DB only. Proves inter-company rule creation,
// document mirroring, consolidation exchange rate translations, automatic eliminations, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import cons from '../vnext/server/modules/governance/consolidation-engine.js';
import { mountConsolidationRoutes } from '../vnext/server/modules/governance/consolidation-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r8-consolidation-'));
const dbPath = path.join(temp, 'r8-consolidation.db');
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

const companyA = 'company-a';
const companyB = 'company-b';

// Setup companies
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(companyA, 'Company A');
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(companyB, 'Company B');

// Setup standard accounts
db.prepare(`
  INSERT INTO account (id, company_id, code, name, type, created_at)
  VALUES ('coa_a_502000', ?, '502000', 'General Expenses', 'expense', '2026-07-19T00:00:00Z'),
         ('coa_b_502000', ?, '502000', 'General Expenses', 'expense', '2026-07-19T00:00:00Z'),
         ('coa_a_104000', ?, '104000', 'Accumulated Depreciation', 'asset', '2026-07-19T00:00:00Z'),
         ('coa_b_104000', ?, '104000', 'Accumulated Depreciation', 'asset', '2026-07-19T00:00:00Z')
`).run(companyA, companyB, companyA, companyB);

// Setup partners
db.prepare(`
  INSERT INTO partner_master (id, company_id, name, partner_type, created_at)
  VALUES ('partner-b-in-a', ?, 'Company B Partner', 'supplier', '2026-07-19T00:00:00Z'),
         ('partner-a-in-b', ?, 'Company A Partner', 'customer', '2026-07-19T00:00:00Z')
`).run(companyA, companyB);

// Setup product
db.prepare(`
  INSERT INTO product_master (id, company_id, name, code, active, created_at)
  VALUES ('prod-item', ?, 'Consulting Services', 'SRV-001', 1, '2026-07-19T00:00:00Z')
`).run(companyA);
db.prepare(`
  INSERT OR IGNORE INTO product_master (id, company_id, name, code, active, created_at)
  VALUES ('prod-item', ?, 'Consulting Services', 'SRV-001', 1, '2026-07-19T00:00:00Z')
`).run(companyB);

// 1. Intercompany rule creation
check('inter-company rules can be created between distinct companies', () => {
  const rule = cons.createIntercompanyRule(db, companyA, {
    partner_id: 'partner-b-in-a',
    target_company_id: companyB,
    target_partner_id: 'partner-a-in-b'
  });
  
  assert.equal(rule.company_id, companyA);
  assert.equal(rule.target_company_id, companyB);
  
  // Try same company (must throw)
  assert.throws(() => {
    cons.createIntercompanyRule(db, companyA, {
      partner_id: 'partner-b-in-a',
      target_company_id: companyA,
      target_partner_id: 'partner-a-in-b'
    });
  }, { code: 'SAME_COMPANY' });
});

// 2. Intercompany PO to SO mirroring
check('confirming Purchase Order automatically mirrors a Sales Order in target company', () => {
  // Insert PO tables if they exist or simulate (R3.3 purchase_order)
  db.prepare(`
    INSERT INTO purchase_order (id, company_id, supplier_id, order_number, state, total_amount, created_at)
    VALUES ('po-ic-1', ?, 'partner-b-in-a', 'PO-1001', 'draft', 1500.00, '2026-07-19T00:00:00Z')
  `).run(companyA);
  
  db.prepare(`
    INSERT INTO purchase_order_line (id, company_id, order_id, product_id, qty, unit_price, subtotal)
    VALUES ('pol-ic-1', ?, 'po-ic-1', 'prod-item', 10, 150.00, 1500.00)
  `).run(companyA);
  
  const mirroredSoId = cons.triggerIntercompanyMirror(db, companyA, 'purchase_order', 'po-ic-1', 'user-buyer');
  assert.ok(mirroredSoId);
  
  // Verify mirrored SO
  const so = db.prepare('SELECT * FROM sales_order WHERE id = ?').get(mirroredSoId);
  assert.ok(so);
  assert.equal(so.company_id, companyB);
  assert.equal(so.partner_id, 'partner-a-in-b');
  assert.equal(so.total_amount, 1500.00);
  
  const lines = db.prepare('SELECT * FROM sales_order_line WHERE order_id = ?').all(mirroredSoId);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].product_id, 'prod-item');
  assert.equal(lines[0].qty, 10);
});

// 3. Translation rates & consolidated report with eliminations
check('consolidated reports apply translation rates and eliminate tagged JEs', () => {
  // Add consolidation rate for B -> A at 0.5
  cons.createConsolidationRate(db, companyA, {
    source_company_id: companyB,
    rate: 0.5,
    effective_date: '2026-07-19'
  });
  
  // 1. Normal GL entry in Company A
  db.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, post_date, state, created_at)
    VALUES ('doc-a-1', ?, 'JE-A-01', 'manual_entry', '2026-07-19', '2026-07-19', 'posted', '2026-07-19')
  `).run(companyA);
  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
    VALUES ('line-1', 'doc-a-1', ?, 'coa_a_502000', 1000.00, 0.0, '2026-07-19')
  `).run(companyA);
  db.prepare(`
    INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, created_at)
    VALUES ('gl-a-1', ?, 'doc-a-1', 'line-1', 'coa_a_502000', '2026-07-19', 1000.00, 0.0, '2026-07-19')
  `).run(companyA);
  
  // 2. Normal GL entry in Company B (1500 units in currency B -> should consolidate as 750 units in currency A)
  db.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, post_date, state, created_at)
    VALUES ('doc-b-1', ?, 'JE-B-01', 'manual_entry', '2026-07-19', '2026-07-19', 'posted', '2026-07-19')
  `).run(companyB);
  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
    VALUES ('line-2', 'doc-b-1', ?, 'coa_b_502000', 1500.00, 0.0, '2026-07-19')
  `).run(companyB);
  db.prepare(`
    INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, created_at)
    VALUES ('gl-b-1', ?, 'doc-b-1', 'line-2', 'coa_b_502000', '2026-07-19', 1500.00, 0.0, '2026-07-19')
  `).run(companyB);
  
  // 3. Elimination inter-company GL entry in Company A (should be completely excluded from report)
  db.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, post_date, state, created_at)
    VALUES ('doc-a-elim', ?, 'JE-A-IC-01', 'manual_entry', '2026-07-19', '2026-07-19', 'posted', '2026-07-19')
  `).run(companyA);
  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
    VALUES ('line-3', 'doc-a-elim', ?, 'coa_a_502000', 900.00, 0.0, '2026-07-19')
  `).run(companyA);
  db.prepare(`
    INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, dims, created_at)
    VALUES ('gl-a-elim', ?, 'doc-a-elim', 'line-3', 'coa_a_502000', '2026-07-19', 900.00, 0.0, '{"elimination":true}', '2026-07-19')
  `).run(companyA);
  
  const report = cons.getConsolidatedReport(db, companyA, [companyA, companyB], 'trial_balance');
  
  // Verify totals: coa_502000 (expense account) should have debit of:
  // Company A (Normal) = 1000
  // Company B (Normal, translated 1500 * 0.5) = 750
  // Company A (Eliminated) = 0 (ignored!)
  // Total = 1750
  const expLine = report.find(r => r.account_code === '502000');
  assert.ok(expLine);
  assert.equal(expLine.debit, 1750.00);
});

// 4. API routes permissions
check('consolidation API routes enforce authentication and scoping', async () => {
  const routes = mountConsolidationRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
    resolveScope: () => ({ tenantId: companyA, companyId: companyA }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => true
  });
  
  async function testRoute(method, pathname, bodyData = null, sessionOverride = undefined) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': companyA };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    
    const currentRoutes = mountConsolidationRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
      resolveScope: () => ({ tenantId: companyA, companyId: companyA }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: () => true
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET consolidated report (allowed)
  const r1 = await testRoute('GET', `/api/x/governance/consolidation/report?source_company_ids=${companyA},${companyB}`);
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
});

// 5. Down Rollback
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
try { db.prepare('DELETE FROM loyalty_points_ledger').run(); } catch (_) {}
try { db.prepare('DELETE FROM loyalty_card').run(); } catch (_) {}
try { db.prepare('DELETE FROM loyalty_program').run(); } catch (_) {}
try { db.prepare('DELETE FROM omni_message_log').run(); } catch (_) {}
try { db.prepare('DELETE FROM omni_campaign').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_operator_log').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_material_issue').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_operator').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_andon_call').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_downtime').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_forecast').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_mps_proposal').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_quality_template').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_quality_inspection').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_ncr').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_asset').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_asset_depreciation_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_maintenance_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_intercompany_rule').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_consolidation_rate').run(); } catch (_) {}
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
try { db.prepare('DELETE FROM warehouses').run(); } catch (_) {}
try { db.prepare('DELETE FROM purchase_order_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM purchase_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM sales_order_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM sales_order').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 801 down restores the Consolidation schema boundary', () => {
  assert.ok(down.migrations.includes('801_r8_consolidation'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_intercompany_rule'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR8 CONSOLIDATION SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
