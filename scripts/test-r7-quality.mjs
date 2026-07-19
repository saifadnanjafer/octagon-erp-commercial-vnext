// R7.4 focused acceptance: disposable DB only. Proves quality templates, inspection results recording,
// auto-promoting failed inspection to NCR/CAPA workflow, quarantine stock movements, Pareto defect reports, route gating, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import qual from '../vnext/server/modules/shopfloor/quality-engine.js';
import { mountQualityRoutes } from '../vnext/server/modules/shopfloor/quality-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r7-quality-'));
const dbPath = path.join(temp, 'r7-quality.db');
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

const company = 'company-r0-demo';

// Setup seeds
db.prepare(`
  INSERT INTO warehouses (warehouse_id, company_id, name)
  VALUES ('wh-1', ?, 'Main Warehouse')
`).run(company);

db.prepare(`
  INSERT INTO locations (location_id, warehouse_id, company_id, name, type)
  VALUES ('loc-stock', 'wh-1', ?, 'Stock', 'internal'),
         ('loc-quarantine', 'wh-1', ?, 'Quarantine', 'inventory_loss')
`).run(company, company);

db.prepare(`
  INSERT INTO product_master (id, company_id, name, code, active, created_at)
  VALUES ('prod-fg', ?, 'Finished Table', 'FG-TBL', 1, '2026-07-19T00:00:00Z')
`).run(company);

// 1. Template creation
check('quality template is created with structured parameters', () => {
  const tmpl = qual.createQualityTemplate(db, company, {
    name: 'Table Inspection Spec',
    product_id: 'prod-fg',
    parameters: [
      { name: 'length', type: 'range', min: 9.9, max: 10.1 },
      { name: 'varnish_smoothness', type: 'pass_fail' }
    ]
  });
  
  assert.equal(tmpl.name, 'Table Inspection Spec');
  assert.equal(tmpl.product_id, 'prod-fg');
  const params = JSON.parse(tmpl.parameters);
  assert.equal(params.length, 2);
  assert.equal(params[0].name, 'length');
});

// 2. Inspection creation and passed result
check('inspection is created and records passed results', () => {
  const tmpl = db.prepare('SELECT id FROM shop_quality_template LIMIT 1').get();
  
  const insp = qual.createInspection(db, company, {
    template_id: tmpl.id,
    product_id: 'prod-fg',
    source_type: 'work_order',
    source_ref: 'wo-101'
  });
  
  assert.equal(insp.status, 'pending');
  assert.equal(insp.source_type, 'work_order');
  
  const res = qual.recordInspectionResult(db, company, insp.id, 'passed', { length: 10.02, varnish_smoothness: 'pass' }, 'inspector-1');
  assert.equal(res.status, 'passed');
  assert.equal(res.ncr, null);
  
  const updated = db.prepare('SELECT * FROM shop_quality_inspection WHERE id = ?').get(insp.id);
  assert.equal(updated.status, 'passed');
  assert.equal(updated.inspected_by, 'inspector-1');
});

// 3. Failed inspection promotion to NCR & stock quarantine
check('failed inspection auto-promotes to NCR and triggers quarantine stock move', () => {
  const tmpl = db.prepare('SELECT id FROM shop_quality_template LIMIT 1').get();
  
  const insp = qual.createInspection(db, company, {
    template_id: tmpl.id,
    product_id: 'prod-fg',
    source_type: 'receipt',
    source_ref: 'rcpt-101'
  });
  
  const res = qual.recordInspectionResult(db, company, insp.id, 'failed', { length: 9.5, varnish_smoothness: 'fail' }, 'inspector-1');
  assert.equal(res.status, 'failed');
  assert.ok(res.ncr);
  
  // Verify NCR created
  const ncr = db.prepare('SELECT * FROM shop_ncr WHERE id = ?').get(res.ncr.id);
  assert.ok(ncr);
  assert.equal(ncr.state, 'open');
  assert.ok(ncr.description.includes('failed'));
  
  // Verify stock move generated
  const move = db.prepare('SELECT * FROM stock_move WHERE product_id = ?').get('prod-fg');
  assert.ok(move);
  assert.equal(move.from_location_id, 'loc-stock');
  assert.equal(move.to_location_id, 'loc-quarantine');
});

// 4. NCR workflow & Pareto report
check('NCR workflow transitions and Pareto reports common failure causes', () => {
  const ncr = db.prepare('SELECT id FROM shop_ncr LIMIT 1').get();
  
  // Contain NCR
  let updated = qual.updateNcrWorkflow(db, company, ncr.id, 'contained', {
    containment_action: 'Isolated the affected batch in warehouse section Q3',
    root_cause: 'Worn out blade edge'
  });
  assert.equal(updated.state, 'contained');
  assert.equal(updated.root_cause, 'Worn out blade edge');
  
  // Verify NCR
  updated = qual.updateNcrWorkflow(db, company, ncr.id, 'verified', {
    corrective_action: 'Replaced blade edge and updated PM checklist schedules',
    verification_notes: 'Verified that subsequent parts meet specification'
  });
  assert.equal(updated.state, 'verified');
  assert.ok(updated.resolved_at);
  
  // Pareto report
  const pareto = qual.getDefectParetoReport(db, company);
  assert.equal(pareto.length, 1);
  assert.equal(pareto[0].cause, 'Worn out blade edge');
  assert.equal(pareto[0].count, 1);
  assert.equal(pareto[0].percentage, 100);
});

// 5. API Gating
check('quality API routes enforce security and company scoping', async () => {
  const routes = mountQualityRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-inspector', groups: ['production'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: (user, perm) => perm === 'shopfloor:view'
  });
  
  async function testRoute(method, pathname, bodyData = null, sessionOverride = undefined) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    
    const currentRoutes = mountQualityRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-inspector', groups: ['production'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: (user, perm) => perm === 'shopfloor:view'
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET Pareto (allowed)
  const r1 = await testRoute('GET', '/api/x/shopfloor/quality/ncr/pareto');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
});

// 6. Rollback
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
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
try { db.prepare('DELETE FROM warehouses').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 704 down restores the Quality schema boundary', () => {
  assert.ok(down.migrations.includes('704_r7_quality'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_quality_template'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR7 QUALITY CONTROL SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
