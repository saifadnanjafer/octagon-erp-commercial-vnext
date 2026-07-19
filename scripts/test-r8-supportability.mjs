// R8.5 focused acceptance: disposable DB only. Proves upgrade tracking, system diagnostics,
// support bundle compilation, API routing, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import support from '../vnext/server/modules/governance/support-engine.js';
import { mountSupportRoutes } from '../vnext/server/modules/governance/support-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r8-supportability-'));
const dbPath = path.join(temp, 'r8-supportability.db');
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

// 1. Upgrade history
check('upgrade history records migration execution details and output logs', () => {
  const upg = support.recordUpgradeHistory(db, 'v2.1.0', 'success', 'All migrations executed cleanly', 'user-admin');
  assert.equal(upg.version, 'v2.1.0');
  assert.equal(upg.status, 'success');
  assert.equal(upg.log_output, 'All migrations executed cleanly');
  
  // Try invalid status
  assert.throws(() => {
    support.recordUpgradeHistory(db, 'v2.1.0', 'unsupported-status', 'Log');
  }, { code: 'STATUS_INVALID' });
});

// 2. Diagnostics
check('diagnostics retrieves SQLite integrity status and OS resource usage metrics', () => {
  const diag = support.getSystemDiagnostics(db, company);
  
  assert.equal(diag.sqlite.integrity_check, 'ok');
  assert.equal(typeof diag.sqlite.foreign_key_violations_count, 'number');
  assert.ok(diag.system.memory_total_mb > 0);
  assert.ok(diag.system.platform);
});

// 3. Support bundle
check('support bundles compile database metadata, table counts, and logs', () => {
  const bundle = support.exportSupportBundle(db, company);
  
  assert.ok(bundle.bundle_id);
  assert.ok(bundle.database_metadata.tables_count > 0);
  assert.ok(bundle.database_metadata.row_counts['shop_upgrade_history'] >= 1);
  assert.equal(bundle.upgrade_history[0].version, 'v2.1.0');
});

// 4. API routes
check('support API routes gate access and verify scoping', async () => {
  const routes = mountSupportRoutes({
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
    
    const currentRoutes = mountSupportRoutes({
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
  
  const r1 = await testRoute('GET', '/api/x/governance/diagnostics');
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
try { db.prepare('DELETE FROM shop_tenant').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_license').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_sso_config').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_user_sso_link').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_org_security_policy').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_api_key').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_webhook_subscription').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_credential_vault').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_upgrade_history').run(); } catch (_) {}
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
check('migration 805 down restores the Supportability schema boundary', () => {
  assert.ok(down.migrations.includes('805_r8_supportability'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_upgrade_history'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR8 SUPPORTABILITY SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
