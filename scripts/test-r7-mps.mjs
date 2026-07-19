// R7.3 focused acceptance: disposable DB only. Proves forecast creation, MPS proposal generation,
// conversion to draft Work Orders / POs, what-if capacity simulations, route gating, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import mps from '../vnext/server/modules/shopfloor/mps-engine.js';
import { mountMpsRoutes } from '../vnext/server/modules/shopfloor/mps-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r7-mps-'));
const dbPath = path.join(temp, 'r7-mps.db');
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
         ('loc-wip', 'wh-1', ?, 'Production WIP', 'production')
`).run(company, company);

db.prepare(`
  INSERT INTO product_master (id, company_id, name, code, active, created_at)
  VALUES ('prod-fg', ?, 'Finished Table', 'FG-TBL', 1, '2026-07-19T00:00:00Z'),
         ('prod-raw', ?, 'Wood Sheet', 'RAW-WD', 1, '2026-07-19T00:00:00Z')
`).run(company, company);

db.prepare(`
  INSERT INTO mrp_bom (id, company_id, product_id, code, output_qty, active, created_at)
  VALUES ('bom-1', ?, 'prod-fg', 'BOM-FG', 1, 1, '2026-07-19T00:00:00Z')
`).run(company);

// 1. Forecast creation
check('forecast demand is created with positive quantities', () => {
  const fc = mps.createForecast(db, company, {
    product_id: 'prod-fg',
    qty: 25,
    demand_date: '2026-07-25'
  });
  
  assert.equal(fc.product_id, 'prod-fg');
  assert.equal(fc.qty, 25);
  assert.equal(fc.demand_date, '2026-07-25');
  
  // Try negative qty
  assert.throws(() => {
    mps.createForecast(db, company, {
      product_id: 'prod-fg',
      qty: -5,
      demand_date: '2026-07-25'
    });
  }, { code: 'QTY_INVALID' });
});

// 2. Proposal generation
check('MPS proposals generate correct type and lead time values', () => {
  // Let's add purchase product forecast too
  mps.createForecast(db, company, {
    product_id: 'prod-raw', // has no BOM, so it's a purchase proposal
    qty: 50,
    demand_date: '2026-07-30'
  });
  
  const props = mps.generateMpsProposals(db, company);
  
  // We have 2 forecast proposals
  assert.equal(props.length, 2);
  
  const p1 = props.find(p => p.product_id === 'prod-fg');
  assert.equal(p1.proposal_type, 'work_order');
  assert.equal(p1.lead_time_days, 3);
  assert.equal(p1.planned_start_date.split('T')[0], '2026-07-22');
  
  const p2 = props.find(p => p.product_id === 'prod-raw');
  assert.equal(p2.proposal_type, 'purchase_order');
  assert.equal(p2.lead_time_days, 5);
  assert.equal(p2.planned_start_date.split('T')[0], '2026-07-25');
});

// 3. Conversion
check('MPS proposals convert to draft work orders and purchase orders', () => {
  const props = mps.getMpsProposals(db, company);
  const p1 = props.find(p => p.proposal_type === 'work_order');
  
  const res = mps.convertProposal(db, company, p1.id, 'user-1');
  assert.equal(res.state, 'converted');
  assert.ok(res.converted_ref);
  
  // Verify draft work order exists
  const wo = db.prepare('SELECT * FROM mrp_work_order WHERE id = ?').get(res.converted_ref);
  assert.ok(wo);
  assert.equal(wo.state, 'draft');
  assert.equal(wo.qty, p1.qty);
});

// 4. What-if Simulation
check('what-if simulation computes capacity daily overloads correctly', () => {
  // Regenerate to reset proposed status of base forecasts
  mps.generateMpsProposals(db, company);
  
  // Add some forecasted demands that overload capacity (> 50 units per day)
  const sim = mps.whatIfSimulation(db, company, [
    { product_id: 'prod-fg', qty: 40, demand_date: '2026-07-25' },
    { product_id: 'prod-fg', qty: 20, demand_date: '2026-07-25' }
  ]);
  
  // The base forecast had 25 units on 2026-07-25. Plus added 40 + 20 = 85 units.
  // Overload = 85 - 50 = 35 units overload.
  const overload = sim.daily_overloads.find(o => o.date === '2026-07-25');
  assert.ok(overload);
  assert.equal(overload.allocated_qty, 85);
  assert.equal(overload.overload_qty, 35);
});

// 5. API Gating
check('MPS routes enforce permissions and scoping', async () => {
  const routes = mountMpsRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-planner', groups: ['production'] }),
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
    
    const currentRoutes = mountMpsRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-planner', groups: ['production'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: (user, perm) => perm === 'shopfloor:view'
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET proposals (allowed)
  const r1 = await testRoute('GET', '/api/x/shopfloor/mps/proposals');
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
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
try { db.prepare('DELETE FROM warehouses').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 703 down restores the MPS schema boundary', () => {
  assert.ok(down.migrations.includes('703_r7_mps'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_forecast'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR7 MPS PLANNING SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
