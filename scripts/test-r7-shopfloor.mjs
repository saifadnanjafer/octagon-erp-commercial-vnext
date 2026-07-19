// R7.1 focused acceptance: disposable DB only. Proves operator creation, PIN badge login,
// work order logs, scrap creation, material issues, API route permissions, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import shop from '../vnext/server/modules/shopfloor/shopfloor-engine.js';
import { mountShopfloorRoutes } from '../vnext/server/modules/shopfloor/shopfloor-routes.js';
import arap from '../vnext/server/finance/arap-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r7-shopfloor-'));
const dbPath = path.join(temp, 'r7-shopfloor.db');
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

// Setup seed warehouse
db.prepare(`
  INSERT INTO warehouses (warehouse_id, company_id, name)
  VALUES ('wh-1', ?, 'Main Warehouse')
`).run(company);

// Setup seed locations
db.prepare(`
  INSERT INTO locations (location_id, warehouse_id, company_id, name, type)
  VALUES ('loc-stock', 'wh-1', ?, 'Stock', 'internal'),
         ('loc-wip', 'wh-1', ?, 'Production WIP', 'production')
`).run(company, company);

// Setup seed product
db.prepare(`
  INSERT INTO product_master (id, company_id, name, code, active, created_at)
  VALUES ('prod-fg', ?, 'Finished Table', 'FG-TBL', 1, '2026-07-19T00:00:00Z'),
         ('prod-raw', ?, 'Wood Sheet', 'RAW-WD', 1, '2026-07-19T00:00:00Z')
`).run(company, company);

// Setup seed BOM
db.prepare(`
  INSERT INTO mrp_bom (id, company_id, product_id, code, output_qty, active, created_at)
  VALUES ('bom-1', ?, 'prod-fg', 'BOM-FG', 1, 1, '2026-07-19T00:00:00Z')
`).run(company);

// Setup seed Work Order
db.prepare(`
  INSERT INTO mrp_work_order (id, company_id, bom_id, product_id, order_number, qty, state, created_at)
  VALUES ('wo-1', ?, 'bom-1', 'prod-fg', 'WO-1001', 10, 'draft', '2026-07-19T00:00:00Z'),
         ('wo-2', ?, 'bom-1', 'prod-fg', 'WO-1002', 5, 'draft', '2026-07-19T00:00:00Z')
`).run(company, company);

// 1. Operator creation and PIN collision
check('operator is created and PIN badge collision is prevented', () => {
  const op1 = shop.createOperator(db, company, {
    id: 'op-1',
    name: 'Mustafa',
    badge_pin: '1234'
  });
  
  assert.equal(op1.name, 'Mustafa');
  assert.equal(op1.badge_pin, '1234');
  
  // Try duplicate PIN
  assert.throws(() => {
    shop.createOperator(db, company, {
      id: 'op-2',
      name: 'Ali',
      badge_pin: '1234'
    });
  }, { code: 'PIN_EXISTS' });
});

// 2. Kiosk operator login via PIN
check('operator login via PIN works for valid active operators', () => {
  const op = shop.loginOperator(db, company, '1234');
  assert.equal(op.name, 'Mustafa');
  
  // Try invalid PIN
  assert.throws(() => {
    shop.loginOperator(db, company, '9999');
  }, { code: 'INVALID_PIN' });
});

// 3. Work order actions and scrap logging
check('work order action logs update state and record scrap', () => {
  // Start
  let res = shop.logWorkOrderAction(db, company, 'op-1', 'wo-1', 'start', 0, 0, 'user-1');
  assert.equal(res.work_order.state, 'running');
  
  // Pause
  res = shop.logWorkOrderAction(db, company, 'op-1', 'wo-1', 'pause', 0, 0, 'user-1');
  assert.equal(res.work_order.state, 'paused');
  
  // Finish with scrap
  res = shop.logWorkOrderAction(db, company, 'op-1', 'wo-1', 'finish', 8, 2, 'user-1');
  assert.equal(res.work_order.state, 'completed');
  
  // Verify operator log
  const stateRes = shop.getWorkOrderTerminalState(db, company, 'wo-1');
  assert.equal(stateRes.logs.length, 3);
  assert.equal(stateRes.logs[2].action, 'finish');
  assert.equal(stateRes.logs[2].qty_produced, 8);
  assert.equal(stateRes.logs[2].qty_scrapped, 2);
  
  // Verify scrap table insertion
  const scrap = db.prepare('SELECT * FROM mrp_scrap WHERE work_order_id = ?').get('wo-1');
  assert.ok(scrap);
  assert.equal(scrap.qty, 2);
  assert.equal(scrap.product_id, 'prod-fg');
  
  // Try logging on completed WO
  assert.throws(() => {
    shop.logWorkOrderAction(db, company, 'op-1', 'wo-1', 'start', 0, 0, 'user-1');
  }, { code: 'WORK_ORDER_INACTIVE' });
});

// 4. Material issue and stock move consumption
check('material issue is recorded and stock move is posted', () => {
  const issue = shop.issueMaterial(db, company, 'wo-2', 'prod-raw', 15.5, 'user-1');
  assert.equal(issue.qty, 15.5);
  assert.equal(issue.product_id, 'prod-raw');
  
  // Verify issue in terminal state
  const stateRes = shop.getWorkOrderTerminalState(db, company, 'wo-2');
  assert.equal(stateRes.material_issued.length, 1);
  assert.equal(stateRes.material_issued[0].qty, 15.5);
  
  // Verify stock move generated
  const move = db.prepare('SELECT * FROM stock_move WHERE product_id = ?').get('prod-raw');
  assert.ok(move);
  assert.equal(move.qty, 15.5);
  assert.equal(move.from_location_id, 'loc-stock');
  assert.equal(move.to_location_id, 'loc-wip');
});

// 5. Routes permissions and scoping
check('shopfloor routes enforce permissions and scoping', async () => {
  const routes = mountShopfloorRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-op', groups: ['production'] }),
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
    
    const currentRoutes = mountShopfloorRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-op', groups: ['production'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: (user, perm) => perm === 'shopfloor:view'
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET terminal state (requires view, allowed)
  const r1 = await testRoute('GET', '/api/x/shopfloor/work-orders/wo-2/state');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  
  // POST create operator (requires manage, allowed via group "production" or explicit manage)
  const r2 = await testRoute('POST', '/api/x/shopfloor/operators', { name: 'Jafar', badge_pin: '5678' });
  assert.equal(r2.processed, true);
  assert.equal(r2.res.statusCode, 201);
  
  // Try with no session to login operator (should succeed because login does not require session)
  const r3 = await testRoute('POST', '/api/x/shopfloor/login', { badge_pin: '1234' }, () => null);
  assert.equal(r3.processed, true);
  assert.equal(r3.res.statusCode, 200);
});

// 6. Rollback testing
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
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 701 down restores the shop floor schema boundary', () => {
  assert.ok(down.migrations.includes('701_r7_shop_floor'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_operator'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR7 SHOPFLOOR SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
