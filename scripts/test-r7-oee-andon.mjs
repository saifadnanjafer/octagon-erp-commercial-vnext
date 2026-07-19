// R7.2 focused acceptance: disposable DB only. Proves raising, acknowledging, and resolving Andon calls,
// downtime tracking, OEE formula calculation, API route gating, and schema rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import shop from '../vnext/server/modules/shopfloor/shopfloor-engine.js';
import oee from '../vnext/server/modules/shopfloor/oee-andon-engine.js';
import { mountOeeAndonRoutes } from '../vnext/server/modules/shopfloor/oee-andon-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r7-oee-andon-'));
const dbPath = path.join(temp, 'r7-oee-andon.db');
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
  VALUES ('prod-fg', ?, 'Finished Table', 'FG-TBL', 1, '2026-07-19T00:00:00Z')
`).run(company);

db.prepare(`
  INSERT INTO mrp_bom (id, company_id, product_id, code, output_qty, active, created_at)
  VALUES ('bom-1', ?, 'prod-fg', 'BOM-FG', 1, 1, '2026-07-19T00:00:00Z')
`).run(company);

db.prepare(`
  INSERT INTO mrp_work_order (id, company_id, bom_id, product_id, order_number, qty, state, created_at)
  VALUES ('wo-1', ?, 'bom-1', 'prod-fg', 'WO-1001', 10, 'draft', '2026-07-19T00:00:00Z')
`).run(company);

const op = shop.createOperator(db, company, { id: 'op-1', name: 'Mustafa', badge_pin: '1234' });

// 1. Andon Calls
check('Andon call lifecycle (raise -> acknowledge -> resolve) works', () => {
  const call = oee.raiseAndonCall(db, company, 'wo-1', 'op-1', 'machine_breakdown', 'Hydraulic fluid leak');
  assert.equal(call.state, 'raised');
  assert.equal(call.reason, 'machine_breakdown');
  
  // Acknowledge
  const ack = oee.acknowledgeAndonCall(db, company, call.id, 'op-1');
  assert.equal(ack.state, 'acknowledged');
  assert.ok(ack.acknowledged_at);
  assert.ok(typeof ack.response_time_sec === 'number');
  
  // Resolve
  const res = oee.resolveAndonCall(db, company, call.id, 'user-super');
  assert.equal(res.state, 'resolved');
  assert.equal(res.resolved_by, 'user-super');
  assert.ok(res.resolved_at);
  assert.ok(typeof res.resolution_time_sec === 'number');
});

// 2. Downtime logging
check('downtime logs start, end, and duration calculation', () => {
  const dt = oee.logDowntimeStart(db, company, 'wc-cnc', 'Blade replacement', 'unplanned');
  assert.equal(dt.work_center_id, 'wc-cnc');
  assert.equal(dt.type, 'unplanned');
  assert.equal(dt.end_at, null);
  
  // End downtime
  const ended = oee.logDowntimeEnd(db, company, dt.id);
  assert.ok(ended.end_at);
  assert.ok(typeof ended.duration_sec === 'number');
  
  // Try ending again
  assert.throws(() => {
    oee.logDowntimeEnd(db, company, dt.id);
  }, { code: 'DOWNTIME_CLOSED' });
});

// 3. OEE calculations
check('OEE calculations correctly compute Availability, Performance, and Quality', () => {
  // Let's seed a controlled duration downtime
  const dtId = 'dt-test';
  db.prepare(`
    INSERT INTO shop_downtime (id, company_id, work_center_id, reason, type, start_at, end_at, duration_sec)
    VALUES (?, ?, 'wc-1', 'Unplanned stop', 'unplanned', '2026-07-19T08:00:00Z', '2026-07-19T09:00:00Z', 3600)
  `).run(dtId, company);
  
  // Shift total planned time = 8 hours (28800 seconds)
  // Unplanned downtime = 3600 seconds
  // Availability = (28800 - 3600) / 28800 = 25200 / 28800 = 0.875 (87.5%)
  
  // Seed operator production logs:
  // Produced = 300 units, Scrapped = 30 units (Good = 270 units)
  // Quality = 270 / 300 = 0.9 (90%)
  db.prepare(`
    INSERT INTO shop_operator_log (id, company_id, work_order_id, operator_id, action, qty_produced, qty_scrapped, logged_at)
    VALUES ('log-test', ?, 'wo-1', 'op-1', 'finish', 300, 30, '2026-07-19T10:00:00Z')
  `).run(company);
  
  // Performance: (Produced * Ideal Cycle Time) / Actual Run Time
  // Ideal Cycle Time = 60 seconds
  // Ideal Produced Time = 300 * 60 = 18000 seconds
  // Actual Run Time = 25200 seconds
  // Performance = 18000 / 25200 = 0.71428 (71.43%)
  
  // OEE = 0.875 * 0.71428 * 0.9 = 0.5625 (56.25%)
  
  const res = oee.computeOee(db, company, 'wc-1', 28800);
  assert.equal(res.availability, 0.875);
  assert.ok(Math.abs(res.performance - 0.7142857) < 0.0001);
  assert.equal(res.quality, 0.9);
  assert.ok(Math.abs(res.oee - 0.5625) < 0.0001);
});

// 4. API Routes permission check
check('OEE/Andon API endpoints check permissions and scoping', async () => {
  const routes = mountOeeAndonRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-supervisor', groups: ['production'] }),
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
    
    const currentRoutes = mountOeeAndonRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-supervisor', groups: ['production'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: (user, perm) => perm === 'shopfloor:view'
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET /api/x/shopfloor/oee (allowed)
  const r1 = await testRoute('GET', '/api/x/shopfloor/oee?work_center_id=wc-1');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  
  // Try with no session to GET OEE (should fail with 401)
  const r2 = await testRoute('GET', '/api/x/shopfloor/oee?work_center_id=wc-1', null, () => null);
  assert.equal(r2.processed, true);
  assert.equal(r2.res.statusCode, 401);
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
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
try { db.prepare('DELETE FROM warehouses').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 702 down restores the OEE & Andon schema boundary', () => {
  assert.ok(down.migrations.includes('702_r7_oee_andon'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_andon_call'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR7 OEE-ANDON SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
