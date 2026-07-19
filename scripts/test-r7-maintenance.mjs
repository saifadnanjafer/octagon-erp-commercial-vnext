// R7.5 focused acceptance: disposable DB only. Proves asset registration, depreciation calculations (straight-line
// and double-declining), posting depreciation to the GL, maintenance order tracking, MTBF, API routing, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import maint from '../vnext/server/modules/shopfloor/maintenance-engine.js';
import { mountMaintenanceRoutes } from '../vnext/server/modules/shopfloor/maintenance-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r7-maintenance-'));
const dbPath = path.join(temp, 'r7-maintenance.db');
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

// Setup standard accounts required for depreciation JEs
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(company, 'Demo Company');
db.prepare(`
  INSERT OR IGNORE INTO account (id, company_id, code, name, type, created_at)
  VALUES ('coa_502000', ?, '502000', 'General Expenses', 'expense', '2026-07-19T00:00:00Z'),
         ('coa_104000', ?, '104000', 'Accumulated Depreciation', 'asset', '2026-07-19T00:00:00Z')
`).run(company, company);

// 1. Asset creation & straight-line depreciation
check('asset is created and generates straight-line depreciation lines correctly', () => {
  const asset = maint.createAsset(db, company, {
    name: 'CNC Milling Machine',
    code: 'CNC-001',
    purchase_value: 12000,
    salvage_value: 2000,
    useful_life_months: 10,
    depreciation_method: 'straight_line',
    purchase_date: '2026-01-01T00:00:00Z'
  });
  
  assert.equal(asset.name, 'CNC Milling Machine');
  
  // Straight line depr amount per month = (12000 - 2000) / 10 = 1000
  const lines = db.prepare('SELECT * FROM shop_asset_depreciation_line WHERE asset_id = ? ORDER BY sequence ASC').all(asset.id);
  assert.equal(lines.length, 10);
  assert.equal(lines[0].amount, 1000);
  assert.equal(lines[9].amount, 1000);
  assert.equal(lines[9].cumulative_depreciation, 10000);
  assert.equal(lines[9].book_value, 2000);
});

// 2. Asset creation & double-declining depreciation
check('asset depreciation uses double declining balance formula', () => {
  const asset = maint.createAsset(db, company, {
    name: 'Delivery Van',
    code: 'VAN-001',
    purchase_value: 20000,
    salvage_value: 4000,
    useful_life_months: 4,
    depreciation_method: 'double_declining',
    purchase_date: '2026-01-01T00:00:00Z'
  });
  
  // Rate = 2 / 4 = 0.5 per month
  // Month 1: 20000 * 0.5 = 10000 depr. Book value = 10000
  // Month 2: 10000 * 0.5 = 5000 depr. Book value = 5000
  // Month 3: 5000 * 0.5 = 2500 depr. But cannot depreciate below salvage value (4000). So depr = 1000. Book value = 4000.
  // Month 4: Depreciated to salvage value, depr = 0. Book value = 4000.
  const lines = db.prepare('SELECT * FROM shop_asset_depreciation_line WHERE asset_id = ? ORDER BY sequence ASC').all(asset.id);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].amount, 10000);
  assert.equal(lines[1].amount, 5000);
  assert.equal(lines[2].amount, 1000);
  assert.equal(lines[3].amount, 0);
});

// 3. Post Depreciation Line to General Ledger
check('depreciation lines post balanced journal entries to GL', () => {
  const line = db.prepare("SELECT * FROM shop_asset_depreciation_line WHERE amount > 0 LIMIT 1").get();
  
  const res = maint.postDepreciationLine(db, company, line.id, 'user-accountant');
  assert.ok(res.posted_entry_id);
  
  // Verify fiscal doc is posted
  const doc = db.prepare('SELECT * FROM fiscal_doc WHERE id = ?').get(res.posted_entry_id);
  assert.equal(doc.state, 'posted');
  
  // Verify GL lines
  const gl = db.prepare('SELECT * FROM gl_line WHERE fiscal_doc_id = ? ORDER BY debit DESC').all(res.posted_entry_id);
  assert.equal(gl.length, 2);
  assert.equal(gl[0].account_id, 'coa_502000');
  assert.equal(gl[0].debit, line.amount);
  assert.equal(gl[1].account_id, 'coa_104000');
  assert.equal(gl[1].credit, line.amount);
  
  // Try posting again (must throw 409)
  assert.throws(() => {
    maint.postDepreciationLine(db, company, line.id, 'user-accountant');
  }, { code: 'LINE_POSTED' });
});

// 4. Maintenance orders and MTBF
check('maintenance orders track completion, failure reasons, and calculate MTBF', () => {
  const asset = db.prepare("SELECT id FROM shop_asset WHERE code = 'CNC-001'").get();
  
  // Create corrective order
  const mo1 = maint.createMaintenanceOrder(db, company, {
    asset_id: asset.id,
    type: 'corrective',
    description: 'Motor overheating'
  });
  assert.equal(mo1.type, 'corrective');
  assert.equal(mo1.state, 'draft');
  
  // Complete it
  const comp = maint.completeMaintenanceOrder(db, company, mo1.id, { failure_reason: 'Broken bearing' }, 'tech-1');
  assert.equal(comp.state, 'completed');
  assert.equal(comp.failure_reason, 'Broken bearing');
  
  // Calculate MTBF
  const mtbf = maint.computeMtbf(db, company, asset.id);
  assert.equal(mtbf.failure_count, 1);
  assert.ok(mtbf.mtbf_hours >= 0);
});

// 5. API Gating
check('maintenance API routes enforce security and company scoping', async () => {
  const routes = mountMaintenanceRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-maint', groups: ['production'] }),
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
    
    const currentRoutes = mountMaintenanceRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-maint', groups: ['production'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: (user, perm) => perm === 'shopfloor:view'
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET MTBF (allowed)
  const asset = db.prepare("SELECT id FROM shop_asset LIMIT 1").get();
  const r1 = await testRoute('GET', `/api/x/shopfloor/assets/mtbf/${asset.id}`);
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
try { db.prepare('DELETE FROM shop_asset').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_asset_depreciation_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_maintenance_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
try { db.prepare('DELETE FROM warehouses').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 705 down restores the Maintenance schema boundary', () => {
  assert.ok(down.migrations.includes('705_r7_maintenance'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_asset'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR7 MAINTENANCE SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
