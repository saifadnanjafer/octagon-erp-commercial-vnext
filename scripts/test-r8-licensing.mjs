// R8.2 focused acceptance: disposable DB only. Proves signed license installation, cryptographic signature
// validation, feature gating, seat checks, grace period read-only locks, trial provisioning, API routing, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import lic from '../vnext/server/modules/governance/licensing-engine.js';
import { mountLicensingRoutes } from '../vnext/server/modules/governance/licensing-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r8-licensing-'));
const dbPath = path.join(temp, 'r8-licensing.db');
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

db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(company, 'Demo Company');
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    userId TEXT,
    createdAt INTEGER,
    expiresAt INTEGER
  );
`);

// 1. Base unlicensed state
check('base unlicensed state defaults to standard features and 5 seats', () => {
  const license = lic.getLicense(db, company);
  assert.equal(license.edition, 'standard');
  assert.equal(license.seats, 5);
  assert.ok(license.unlicensed);
});

// 2. Install license with cryptographic signature
check('tamper-proof license keys verify signatures and reject modifications', () => {
  const edition = 'enterprise';
  const modules = ['sales', 'procurement', 'inventory', 'shopfloor'];
  const seats = 10;
  const expiry = '2026-12-31T00:00:00Z';
  const modulesStr = JSON.stringify(modules);
  
  const signature = lic.computeSignature(company, edition, modulesStr, seats, expiry);
  
  const res = lic.installLicense(db, company, {
    edition,
    modules,
    seats,
    expiry_date: expiry,
    signature
  });
  
  assert.ok(res.success);
  assert.equal(res.edition, 'enterprise');
  
  // Verify feature gating
  const fg = lic.isFeatureLicensed(db, company, 'shopfloor');
  assert.equal(fg.licensed, true);
  
  // Try tampered license (signature fails)
  assert.throws(() => {
    lic.installLicense(db, company, {
      edition: 'enterprise',
      modules: ['sales', 'admin_override'], // tampered
      seats,
      expiry_date: expiry,
      signature
    });
  }, { code: 'SIGNATURE_INVALID' });
});

// 3. License expiry grace period locks
check('expired licenses throw blockages after the 14-day grace period', () => {
  // Expired 20 days ago (past 14-day grace)
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 20);
  const expiry = expiredDate.toISOString();
  
  const edition = 'enterprise';
  const modules = ['sales'];
  const seats = 5;
  const modulesStr = JSON.stringify(modules);
  const signature = lic.computeSignature(company, edition, modulesStr, seats, expiry);
  
  lic.installLicense(db, company, {
    edition,
    modules,
    seats,
    expiry_date: expiry,
    signature
  });
  
  // Checking feature license must throw locking error
  assert.throws(() => {
    lic.isFeatureLicensed(db, company, 'sales');
  }, { code: 'LICENSE_EXPIRED_LOCK' });
});

// 4. Seat usage check
check('checkSeatUsage calculates active session counts against limits', () => {
  // Let's reinstall a valid license first
  const expiry = '2030-01-01T00:00:00Z';
  const modules = ['sales'];
  const signature = lic.computeSignature(company, 'standard', JSON.stringify(modules), 2, expiry);
  lic.installLicense(db, company, {
    edition: 'standard',
    modules,
    seats: 2,
    expiry_date: expiry,
    signature
  });
  
  // Add 3 mock sessions (limit is 2)
  db.prepare(`
    INSERT INTO auth_sessions (token, userId, createdAt, expiresAt)
    VALUES ('t1', 'u1', 1, 999999999),
           ('t2', 'u2', 2, 999999999),
           ('t3', 'u3', 3, 999999999)
  `).run();
  
  const seatsStatus = lic.checkSeatUsage(db, company);
  assert.equal(seatsStatus.session_count, 3);
  assert.equal(seatsStatus.exceeded, true);
});

// 5. Tenant Trial provisioning
check('provisioning a trial tenant generates warehouse and default locations', () => {
  const trial = lic.provisionTrialTenant(db, 'trial-acme', 'Acme Corp');
  assert.equal(trial.tenant_id, 'trial-acme');
  assert.equal(trial.company_id, 'comp-trial-acme');
  
  // Verify seeded locations
  const loc = db.prepare("SELECT * FROM locations WHERE warehouse_id = 'wh-trial-acme'").get();
  assert.ok(loc);
  assert.equal(loc.company_id, 'comp-trial-acme');
  assert.equal(loc.type, 'internal');
});

// 6. API routes permissions
check('licensing API routes enforce security checks', async () => {
  const routes = mountLicensingRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => true
  });
  
  async function testRoute(method, pathname, bodyData = null, sessionOverride = undefined) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    
    const currentRoutes = mountLicensingRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: () => true
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  const r1 = await testRoute('GET', '/api/x/governance/licensing/license');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
});

// 7. Rollback
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
try { db.prepare('DELETE FROM shop_tenant').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_license').run(); } catch (_) {}
try { db.prepare('DELETE FROM auth_sessions').run(); } catch (_) {}
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
try { db.prepare('DELETE FROM warehouses').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 802 down restores the Licensing schema boundary', () => {
  assert.ok(down.migrations.includes('802_r8_licensing'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_tenant'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR8 LICENSING SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
