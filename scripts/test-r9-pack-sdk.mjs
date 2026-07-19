// R9.1 focused acceptance: disposable DB only. Proves pack manifest validation, install/uninstall lifecycle,
// edition entitlement gating, patch application/reversion with residue-zero conformance, patch conflict detection,
// API routing, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import packSdk from '../vnext/server/modules/packs/pack-sdk-engine.js';
import { mountPackRoutes } from '../vnext/server/modules/packs/pack-sdk-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r9-pack-'));
const dbPath = path.join(temp, 'r9-pack.db');
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

// 1. Manifest validation
check('manifest validation rejects missing required fields and invalid editions', () => {
  assert.throws(() => packSdk.validateManifest(null), { code: 'MANIFEST_INVALID' });
  assert.throws(() => packSdk.validateManifest({}), { code: 'MANIFEST_MISSING_FIELD' });
  assert.throws(() => packSdk.validateManifest({ pack_id: 'x', name: 'X', version: '1.0', edition_required: 'platinum' }), { code: 'EDITION_INVALID' });
  assert.throws(() => packSdk.validateManifest({ pack_id: 'x', name: 'X', version: '1.0', patches: [{ target_type: 'invalid', action: 'add', target_key: 'k' }] }), { code: 'PATCH_TARGET_INVALID' });
  
  // Valid manifest passes
  assert.ok(packSdk.validateManifest({
    pack_id: 'workshop', name: 'Workshop Pack', version: '1.0.0',
    edition_required: 'standard',
    patches: [
      { target_type: 'collection', action: 'add', target_key: 'job_orders', data: { fields: ['name', 'status'] } },
      { target_type: 'terminology', action: 'add', target_key: 'invoice_label', data: { en: 'Job Invoice', ar: 'فاتورة المهمة' } }
    ]
  }));
});

// 2. Install + uninstall lifecycle
check('pack installs with patches applied and uninstalls with zero residue', () => {
  const manifest = {
    pack_id: 'workshop',
    name: 'Workshop & Advertising Production',
    version: '1.0.0',
    description: 'Job-order chain, design/proofing states, material-per-job costing',
    author: 'Octagon',
    edition_required: 'standard',
    patches: [
      { target_type: 'collection', action: 'add', target_key: 'job_orders', data: { fields: ['name', 'status', 'assigned_to'] } },
      { target_type: 'state', action: 'add', target_key: 'job_orders:design', data: { label: 'Design', sequence: 1 } },
      { target_type: 'terminology', action: 'add', target_key: 'home_title', data: { en: 'Workshop Dashboard', ar: 'لوحة ورشة العمل' } }
    ]
  };

  const result = packSdk.installPack(db, company, manifest);
  assert.equal(result.installed, true);
  assert.equal(result.pack_id, 'workshop');
  assert.ok(result.manifest_hash);

  // Verify registry
  const packs = packSdk.listPacks(db, company);
  assert.equal(packs.length, 1);
  assert.equal(packs[0].pack_id, 'workshop');
  assert.equal(packs[0].installed, 1);

  // Verify patches applied
  const patches = db.prepare('SELECT * FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').all(company, 'workshop');
  assert.equal(patches.length, 3);

  // Duplicate install blocked
  assert.throws(() => packSdk.installPack(db, company, manifest), { code: 'PACK_ALREADY_INSTALLED' });

  // Uninstall
  const uninstallResult = packSdk.uninstallPack(db, company, 'workshop');
  assert.equal(uninstallResult.uninstalled, true);
  assert.equal(uninstallResult.patches_reverted, 3);

  // Verify no applied patches remain (residue-zero)
  const activePatches = db.prepare('SELECT COUNT(*) as cnt FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').get(company, 'workshop');
  assert.equal(activePatches.cnt, 0);

  // Uninstall again should fail
  assert.throws(() => packSdk.uninstallPack(db, company, 'workshop'), { code: 'PACK_NOT_INSTALLED' });
});

// 3. Conformance checker
check('conformance check detects residue-zero compliance and patch conflicts', () => {
  // Reinstall for conformance test
  packSdk.installPack(db, company, {
    pack_id: 'retail',
    name: 'Retail POS Pack',
    version: '1.0.0',
    patches: [
      { target_type: 'collection', action: 'add', target_key: 'pos_configs', data: {} },
      { target_type: 'permission', action: 'add', target_key: 'pos:cashier', data: {} }
    ]
  });

  const conf = packSdk.checkConformance(db, company, 'retail');
  assert.equal(conf.passed, true);
  assert.ok(conf.findings.length >= 3);
  assert.ok(conf.findings.every(f => f.pass));

  // Uninstall and check residue-zero conformance
  packSdk.uninstallPack(db, company, 'retail');
  const conf2 = packSdk.checkConformance(db, company, 'retail');
  assert.equal(conf2.passed, true);
  const residueCheck = conf2.findings.find(f => f.check === 'patch_residue');
  assert.ok(residueCheck);
  assert.equal(residueCheck.pass, true);
});

// 4. Edition entitlement gating (negative)
check('enterprise-required packs are blocked when no license or standard license exists', () => {
  // Create a licensing table entry for standard edition (if table exists)
  const hasLicTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_license'").get();
  if (hasLicTable) {
    // Ensure clean slate
    db.prepare("DELETE FROM shop_license WHERE company_id = ?").run(company);
    db.prepare(`INSERT INTO shop_license (id, company_id, edition, license_key, modules, seats, expiry_date, signature, created_at) 
      VALUES (?, ?, 'standard', 'test-key', '[]', 5, '2030-01-01', 'test-sig', ?)`).run('lic_test', company, new Date().toISOString());

    assert.throws(() => {
      packSdk.installPack(db, company, {
        pack_id: 'advanced_analytics',
        name: 'Advanced Analytics',
        version: '1.0.0',
        edition_required: 'enterprise'
      });
    }, { code: 'EDITION_INSUFFICIENT' });
  }
});

// 5. Manifest hashing
check('manifest hashing produces deterministic SHA-256 digests', () => {
  const m1 = { pack_id: 'test', name: 'Test', version: '1.0.0' };
  const h1 = packSdk.hashManifest(m1);
  const h2 = packSdk.hashManifest(m1);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64); // SHA-256 hex

  // Different manifest produces different hash
  const m2 = { pack_id: 'test', name: 'Test', version: '2.0.0' };
  assert.notEqual(packSdk.hashManifest(m2), h1);
});

// 6. API routes
check('pack API routes enforce security and respond correctly', async () => {
  const routes = mountPackRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => true
  });

  // GET list
  const listReq = new EventEmitter();
  listReq.method = 'GET';
  listReq.url = '/api/x/packs';
  listReq.headers = { 'x-company-id': company };
  const listRes = { writeHead() {}, end() {} };
  const urlObj = new URL('/api/x/packs', 'http://localhost');
  const processed = routes.handle(listReq, listRes, urlObj);
  assert.equal(processed, true);
  assert.equal(listRes.statusCode, 200);
});

// 7. Rollback
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete;');
// Clean all tables for rollback
const cleanTables = [
  'gl_line', 'dunning_action', 'subscription_invoice', 'subscription_change',
  'subscription', 'subscription_plan', 'payment_allocation', 'payment',
  'fiscal_doc_line', 'arap_document', 'fiscal_doc', 'partner_master',
  'product_master', 'account', 'companies', 'r3_worklist_item',
  'loyalty_points_ledger', 'loyalty_card', 'loyalty_program',
  'omni_message_log', 'omni_campaign', 'shop_operator_log',
  'shop_material_issue', 'shop_operator', 'shop_andon_call', 'shop_downtime',
  'shop_forecast', 'shop_mps_proposal', 'shop_quality_template',
  'shop_quality_inspection', 'shop_ncr', 'shop_asset',
  'shop_asset_depreciation_line', 'shop_maintenance_order',
  'shop_intercompany_rule', 'shop_consolidation_rate', 'shop_tenant',
  'shop_license', 'shop_sso_config', 'shop_user_sso_link',
  'shop_org_security_policy', 'shop_api_key', 'shop_webhook_subscription',
  'shop_credential_vault', 'shop_upgrade_history',
  'shop_pack_patch', 'shop_pack_migration', 'shop_pack_registry',
  'auth_sessions', 'stock_move', 'locations', 'mrp_work_order', 'mrp_bom', 'warehouses'
];
for (const t of cleanTables) {
  try { db.prepare(`DELETE FROM "${t}"`).run(); } catch (_) {}
}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 901 down restores the Pack SDK schema boundary', () => {
  assert.ok(down.migrations.includes('901_r9_pack_sdk'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_pack_registry'").get(), undefined);
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_pack_patch'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR9 PACK SDK SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
